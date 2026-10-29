"""自訂圖示影像處理管線（→ ADR-0006 §3）：純函式，不需要 DB。"""

import os
from io import BytesIO

import pytest
from PIL import Image

from app.services import icon_image
from app.services.icon_image import (
    MAX_ICON_BYTES,
    IconEmptyError,
    IconTooLargeError,
    IconTooManyPixelsError,
    IconUnsupportedError,
    process_icon,
)


def _encode(image: Image.Image, fmt: str, **kwargs: object) -> bytes:
    buf = BytesIO()
    image.save(buf, format=fmt, **kwargs)
    return buf.getvalue()


def _open(png: bytes) -> Image.Image:
    image = Image.open(BytesIO(png))
    image.load()
    return image


def _white_with_black_square() -> Image.Image:
    """白底 200×200，中間 100×100 黑方塊，方塊正中央有 10×10 白點。"""
    image = Image.new("RGB", (200, 200), (255, 255, 255))
    image.paste((0, 0, 0), (50, 50, 150, 150))
    image.paste((255, 255, 255), (95, 95, 105, 105))
    return image


@pytest.mark.parametrize("fmt", ["PNG", "JPEG", "WEBP", "GIF"])
def test_accepted_formats_become_256_rgba_png(fmt: str) -> None:
    raw = _encode(Image.new("RGB", (300, 300), (30, 120, 200)), fmt)
    out = _open(process_icon(raw, remove_white_background=False))
    assert out.format == "PNG"
    assert out.size == (256, 256)
    assert out.mode in {"RGBA", "P"}


def test_output_is_deterministic() -> None:
    raw = _encode(_white_with_black_square(), "JPEG")
    first = process_icon(raw, remove_white_background=True)
    second = process_icon(raw, remove_white_background=True)
    assert first == second


def test_tall_image_is_centered_without_stretching() -> None:
    raw = _encode(Image.new("RGB", (100, 400), (200, 50, 50)), "PNG")
    out = _open(process_icon(raw, remove_white_background=False)).convert("RGBA")
    left, top, right, bottom = out.getchannel("A").getbbox() or (0, 0, 0, 0)
    assert (top, bottom) == (0, 256)
    assert right - left == 64  # 100:400 縮到高 256 → 寬 64
    assert left == (256 - 64) // 2


def test_metadata_is_stripped() -> None:
    exif = Image.Exif()
    exif[0x8825] = {2: (25, 4, 30)}  # GPSInfo
    exif[0x010F] = "Camera Maker"
    raw = _encode(Image.new("RGB", (120, 120), (10, 200, 10)), "JPEG", exif=exif)
    out = _open(process_icon(raw, remove_white_background=False))
    assert "exif" not in out.info
    assert len(out.getexif()) == 0


def test_exif_orientation_is_applied() -> None:
    exif = Image.Exif()
    exif[0x0112] = 6  # 需順時針轉 90 度才是正確方向
    raw = _encode(Image.new("RGB", (400, 100), (10, 10, 200)), "JPEG", exif=exif)
    out = _open(process_icon(raw, remove_white_background=False)).convert("RGBA")
    left, top, right, bottom = out.getchannel("A").getbbox() or (0, 0, 0, 0)
    assert bottom - top > right - left  # 橫圖轉正後變直圖


def test_remove_white_background_keeps_inner_white() -> None:
    raw = _encode(_white_with_black_square(), "PNG")
    out = _open(process_icon(raw, remove_white_background=True)).convert("RGBA")
    # 外圍白底被裁掉，只剩黑方塊（縮放到 256×256 填滿）
    assert out.getpixel((2, 2))[3] == 255
    assert out.getpixel((2, 2))[:3] == (0, 0, 0)
    # 方塊中央的白點不與邊緣相連，必須保留且不透明
    center = out.getpixel((128, 128))
    assert center[3] == 255
    assert min(center[:3]) > 200


def test_without_remove_white_background_white_stays() -> None:
    raw = _encode(_white_with_black_square(), "PNG")
    out = _open(process_icon(raw, remove_white_background=False)).convert("RGBA")
    assert out.getpixel((2, 2)) == (255, 255, 255, 255)


def test_all_white_with_removal_is_empty() -> None:
    raw = _encode(Image.new("RGB", (64, 64), (255, 255, 255)), "PNG")
    with pytest.raises(IconEmptyError):
        process_icon(raw, remove_white_background=True)


def test_noisy_photo_is_compressed_under_limit() -> None:
    noise = Image.frombytes("RGB", (512, 512), os.urandom(512 * 512 * 3))
    png = process_icon(_encode(noise, "PNG"), remove_white_background=False)
    assert len(png) <= MAX_ICON_BYTES
    assert _open(png).size[0] in {192, 128, 256}


def test_16bit_grayscale_and_palette_transparency() -> None:
    gray16 = Image.new("I;16", (80, 80), 40000)
    assert _open(process_icon(_encode(gray16, "PNG"), remove_white_background=False))
    palette = Image.new("P", (80, 80), 0)
    palette.putpalette([255, 0, 0, 0, 255, 0] + [0] * (256 * 3 - 6))
    palette.paste(1, (20, 20, 60, 60))
    raw = _encode(palette, "PNG", transparency=0)
    out = _open(process_icon(raw, remove_white_background=False)).convert("RGBA")
    assert out.getpixel((128, 128))[:3] == (0, 255, 0)


@pytest.mark.parametrize(
    "raw",
    [
        b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        b"<html><body>hi</body></html>",
        b"",
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 20,
    ],
)
def test_non_images_are_rejected(raw: bytes) -> None:
    with pytest.raises(IconUnsupportedError):
        process_icon(raw, remove_white_background=False)


def test_other_pillow_formats_are_rejected() -> None:
    raw = _encode(Image.new("RGB", (50, 50), (1, 2, 3)), "BMP")
    with pytest.raises(IconUnsupportedError):
        process_icon(raw, remove_white_background=False)


def test_too_many_pixels(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(icon_image, "MAX_PIXELS", 100 * 100 - 1)
    raw = _encode(Image.new("RGB", (100, 100), (1, 2, 3)), "PNG")
    with pytest.raises(IconTooManyPixelsError):
        process_icon(raw, remove_white_background=False)


def test_too_large(monkeypatch: pytest.MonkeyPatch) -> None:
    raw = _encode(Image.new("RGB", (100, 100), (1, 2, 3)), "PNG")
    monkeypatch.setattr(icon_image, "MAX_UPLOAD_BYTES", len(raw) - 1)
    with pytest.raises(IconTooLargeError):
        process_icon(raw, remove_white_background=False)
