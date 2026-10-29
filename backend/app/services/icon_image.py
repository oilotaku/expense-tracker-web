"""自訂圖示的影像處理管線（→ ADR-0006 §3）。

輸入使用者上傳的原始位元組，輸出重新編碼後的 256×256（必要時 192 / 128）透明 PNG。
原檔不落地；輸出不帶任何 metadata。同輸入、同參數一定得到位元組相同的輸出，預覽與正式
上傳共用本函式，所以使用者看到的預覽就是最後存下的圖。
"""

from io import BytesIO
from typing import Final

from PIL import Image, ImageChops, ImageDraw, ImageFilter, UnidentifiedImageError

from app.core.exceptions import AppError

MAX_UPLOAD_BYTES: Final[int] = 10 * 1024 * 1024  # 對齊 Next.js rewrites 預設轉發上限（ADR-0006 §4）
MAX_PIXELS: Final[int] = 50_000_000
WORK_SIZE: Final[int] = 1024
ICON_SIZES: Final[tuple[int, ...]] = (256, 192, 128)
MAX_ICON_BYTES: Final[int] = 64 * 1024
ALLOWED_FORMATS: Final[frozenset[str]] = frozenset({"PNG", "JPEG", "WEBP", "GIF"})
# 每個色版與 255 的距離在此以內視為「近白色」；邊緣半透明的白邊用兩倍容差再吃掉一圈
WHITE_TOLERANCE: Final[int] = 24
_FILLED: Final[int] = 128  # flood fill 標記值，與 0 / 255 區隔

# 超過兩倍時 Pillow 直接拋 DecompressionBombError；一般情況由下方明確檢查先擋
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

_EXIF_ORIENTATION_TAG: Final[int] = 0x0112
_ORIENTATION_TRANSPOSE: Final[dict[int, Image.Transpose]] = {
    2: Image.Transpose.FLIP_LEFT_RIGHT,
    3: Image.Transpose.ROTATE_180,
    4: Image.Transpose.FLIP_TOP_BOTTOM,
    5: Image.Transpose.TRANSPOSE,
    6: Image.Transpose.ROTATE_270,
    7: Image.Transpose.TRANSVERSE,
    8: Image.Transpose.ROTATE_90,
}


class IconImageError(AppError):
    def __init__(self, detail: str, status_code: int = 422) -> None:
        super().__init__(detail, response_code=status_code, status_code=status_code)


class IconTooLargeError(IconImageError):
    def __init__(self) -> None:
        super().__init__("圖片超過 10 MB，請先縮小", status_code=413)


class IconTooManyPixelsError(IconImageError):
    def __init__(self) -> None:
        super().__init__("圖片超過 5,000 萬像素")


class IconUnsupportedError(IconImageError):
    def __init__(self) -> None:
        super().__init__("只接受 PNG、JPEG、WebP、GIF")


class IconEmptyError(IconImageError):
    def __init__(self) -> None:
        super().__init__("去除背景後沒有剩下任何內容")


def process_icon(raw: bytes, *, remove_white_background: bool) -> bytes:
    """原始圖片位元組 → 重新編碼的透明 PNG。失敗一律拋 `IconImageError` 子類。"""
    if len(raw) > MAX_UPLOAD_BYTES:
        raise IconTooLargeError()
    image = _decode(raw)
    if remove_white_background:
        image = _remove_white_background(image)
    image = _crop_transparent_border(image)
    return _encode_within_limit(image)


def _decode(raw: bytes) -> Image.Image:
    try:
        with Image.open(BytesIO(raw)) as src:
            if src.format not in ALLOWED_FORMATS:
                raise IconUnsupportedError()
            width, height = src.size
            if width * height > MAX_PIXELS:
                raise IconTooManyPixelsError()
            orientation = src.getexif().get(_EXIF_ORIENTATION_TAG)
            if src.format == "JPEG":
                # 讓解碼器直接以 1/2~1/8 比例解碼，大照片不必先展開成全尺寸
                src.draft("RGB", (WORK_SIZE, WORK_SIZE))
            src.seek(0)  # GIF / 動態 WebP 只取第一幀
            src.thumbnail((WORK_SIZE, WORK_SIZE), Image.Resampling.LANCZOS)
            image = _to_rgba(src)
    except Image.DecompressionBombError as e:
        raise IconTooManyPixelsError() from e
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, EOFError) as e:
        raise IconUnsupportedError() from e
    transpose = _ORIENTATION_TRANSPOSE.get(orientation) if isinstance(orientation, int) else None
    return image.transpose(transpose) if transpose is not None else image


def _to_rgba(image: Image.Image) -> Image.Image:
    if image.mode.startswith("I"):
        # 16 位元灰階：先壓到 8 位元，RGBA 轉換不直接支援 I;16
        image = image.convert("I").point(lambda v: v * (1 / 256)).convert("L")
    # convert 一律產生新影像，回傳值不帶原檔的 info / exif
    return image.convert("RGBA")


def _remove_white_background(image: Image.Image) -> Image.Image:
    """只把「與圖片邊緣相連」的近白色改成透明；圖中間的白色（如眼睛反光）保留。"""
    r, g, b, alpha = image.split()
    min_channel = ImageChops.darker(ImageChops.darker(r, g), b)
    near_white = min_channel.point(lambda v: 255 if v >= 255 - WHITE_TOLERANCE else 0)
    already_clear = alpha.point(lambda v: 255 if v == 0 else 0)
    passable = ImageChops.lighter(near_white, already_clear)

    width, height = passable.size
    border = (
        [(x, 0) for x in range(width)]
        + [(x, height - 1) for x in range(width)]
        + [(0, y) for y in range(height)]
        + [(width - 1, y) for y in range(height)]
    )
    for xy in border:
        if passable.getpixel(xy) == 255:
            ImageDraw.floodfill(passable, xy, _FILLED, thresh=0)
    background = passable.point(lambda v: 255 if v == _FILLED else 0)

    # 抗鋸齒的白邊：背景往外擴一圈，只吃掉其中偏白（兩倍容差內）的像素
    semi_white = min_channel.point(lambda v: 255 if v >= 255 - 2 * WHITE_TOLERANCE else 0)
    halo = ImageChops.darker(background.filter(ImageFilter.MaxFilter(3)), semi_white)
    background = ImageChops.lighter(background, halo)

    image.putalpha(ImageChops.subtract(alpha, background))
    return image


def _crop_transparent_border(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise IconEmptyError()
    return image.crop(bbox)


def _fit_on_canvas(image: Image.Image, size: int) -> Image.Image:
    """等比縮放後置中貼到 size×size 透明畫布；細長圖兩側留透明，不拉伸。"""
    width, height = image.size
    scale = min(size / width, size / height)
    new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
    resized = image.resize(new_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((size - new_size[0]) // 2, (size - new_size[1]) // 2))
    return canvas


def _encode_png(image: Image.Image) -> bytes:
    buf = BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _encode_within_limit(image: Image.Image) -> bytes:
    """依序嘗試 256 / 192 / 128 邊長，每個尺寸先全彩、再 256 色調色盤（保留透明）。"""
    for size in ICON_SIZES:
        canvas = _fit_on_canvas(image, size)
        png = _encode_png(canvas)
        if len(png) <= MAX_ICON_BYTES:
            return png
        png = _encode_png(canvas.quantize(256, method=Image.Quantize.FASTOCTREE))
        if len(png) <= MAX_ICON_BYTES:
            return png
    raise IconImageError("圖片處理後仍超過 64 KB")
