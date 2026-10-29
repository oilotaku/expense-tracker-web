"""自訂圖示 API（→ ADR-0006）：打真實 PostgreSQL / Redis（測試實例），不 mock。"""

import uuid
from collections.abc import AsyncIterator
from io import BytesIO

import pytest
from httpx import AsyncClient, Response
from PIL import Image

from app.api.v1 import icons as icons_api
from app.services import icon_service

_PASSWORD = "correct horse battery"


async def _login(client: AsyncClient, email: str | None = None) -> None:
    payload = {"email": email or f"icon-{uuid.uuid4().hex[:12]}@example.com", "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200


def _png(color: tuple[int, int, int] = (30, 120, 200), size: tuple[int, int] = (64, 64)) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


async def _send(
    client: AsyncClient, url: str, raw: bytes, *, remove_white: bool = False
) -> Response:
    return await client.post(
        url,
        files={"file": ("icon.png", raw, "image/png")},
        data={"remove_white_background": "true" if remove_white else "false"},
    )


async def _upload(client: AsyncClient, raw: bytes | None = None) -> dict[str, object]:
    res = await _send(client, "/api/v1/icons", raw or _png())
    assert res.status_code == 201, res.text
    data: dict[str, object] = res.json()["data"]
    return data


async def test_requires_login(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/icons")).status_code == 401
    res = await _send(client, "/api/v1/icons/preview", _png())
    assert res.status_code == 401


async def test_preview_returns_png_and_stores_nothing(client: AsyncClient) -> None:
    await _login(client)
    res = await _send(client, "/api/v1/icons/preview", _png())
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert res.headers["cache-control"] == "no-store"
    assert Image.open(BytesIO(res.content)).size == (256, 256)
    listing = (await client.get("/api/v1/icons")).json()["data"]
    assert listing["items"] == []
    assert listing["quota"] == {"used": 0, "limit": icon_service.ICON_QUOTA}


async def test_upload_matches_preview_and_serves_image(client: AsyncClient) -> None:
    await _login(client)
    raw = _png((200, 30, 30))
    preview = await _send(client, "/api/v1/icons/preview", raw, remove_white=True)
    upload = await _send(client, "/api/v1/icons", raw, remove_white=True)
    assert upload.status_code == 201
    data = upload.json()["data"]
    assert data["icon_key"] == f"custom:{data['user_icon_uid']}"
    assert data["url"] == f"/api/v1/icons/{data['user_icon_uid']}"
    assert data["usage_count"] == 0

    image = await client.get(data["url"])
    assert image.status_code == 200
    assert image.content == preview.content  # 預覽即實際結果
    assert image.headers["content-type"] == "image/png"
    assert "immutable" in image.headers["cache-control"]
    assert image.headers["x-content-type-options"] == "nosniff"
    assert image.headers["content-security-policy"] == "default-src 'none'"
    assert image.headers["etag"] == f'"{data["content_sha256"]}"'

    cached = await client.get(data["url"], headers={"If-None-Match": image.headers["etag"]})
    assert cached.status_code == 304
    assert cached.content == b""


async def test_duplicate_upload_returns_existing(client: AsyncClient) -> None:
    await _login(client)
    first = await _upload(client)
    res = await _send(client, "/api/v1/icons", _png())
    assert res.status_code == 200
    assert res.json()["data"]["user_icon_uid"] == first["user_icon_uid"]
    assert (await client.get("/api/v1/icons")).json()["data"]["quota"]["used"] == 1


async def test_list_newest_first_with_quota(client: AsyncClient) -> None:
    await _login(client)
    a = await _upload(client, _png((1, 1, 1)))
    b = await _upload(client, _png((2, 200, 2)))
    data = (await client.get("/api/v1/icons")).json()["data"]
    assert [i["user_icon_uid"] for i in data["items"]] == [b["user_icon_uid"], a["user_icon_uid"]]
    assert data["quota"]["used"] == 2


async def test_quota_exceeded(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(icon_service, "ICON_QUOTA", 1)
    await _login(client)
    await _upload(client, _png((1, 1, 1)))
    res = await _send(client, "/api/v1/icons", _png((9, 9, 9)))
    assert res.status_code == 409
    assert "上限" in res.json()["detail"]


async def test_rejects_bad_uploads(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    await _login(client)
    missing = await client.post("/api/v1/icons", data={"remove_white_background": "false"})
    assert missing.status_code == 422
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    res = await client.post("/api/v1/icons", files={"file": ("x.svg", svg, "image/svg+xml")})
    assert res.status_code == 422
    assert res.json()["detail"] == "只接受 PNG、JPEG、WebP、GIF"

    monkeypatch.setattr(icons_api, "MAX_UPLOAD_BYTES", 100)
    too_big = await _send(client, "/api/v1/icons", _png())
    assert too_big.status_code == 413
    assert too_big.json()["detail"] == "圖片超過 10 MB，請先縮小"
    assert (await client.get("/api/v1/icons")).json()["data"]["items"] == []


async def test_other_users_icons_are_404(client: AsyncClient) -> None:
    await _login(client)
    icon = await _upload(client)
    await _login(client)  # 換成另一個使用者
    assert (await client.get(str(icon["url"]))).status_code == 404
    assert (await client.get(f"{icon['url']}/usages")).status_code == 404
    assert (await client.delete(str(icon["url"]))).status_code == 404
    res = await client.post(
        "/api/v1/accounts",
        json={"name": "偷用", "balance": "0", "color": "#8B6ED6", "icon": icon["icon_key"]},
    )
    assert res.status_code == 422


async def test_custom_icon_on_account_and_category_then_delete_resets(
    client: AsyncClient,
) -> None:
    await _login(client)
    icon = await _upload(client)
    key = icon["icon_key"]

    account = await client.post(
        "/api/v1/accounts",
        json={"name": "零錢包", "balance": "0", "color": "#8B6ED6", "icon": key},
    )
    assert account.status_code == 201
    account_uid = account.json()["data"]["account_uid"]
    category = await client.post(
        "/api/v1/categories", json={"name": "早餐", "color": "#8B6ED6", "icon": "food"}
    )
    category_uid = category.json()["data"]["category_uid"]
    patched = await client.patch(f"/api/v1/categories/{category_uid}", json={"icon": key})
    assert patched.status_code == 200
    assert patched.json()["data"]["icon"] == key

    listing = (await client.get("/api/v1/icons")).json()["data"]
    assert listing["items"][0]["usage_count"] == 2
    usages = (await client.get(f"{icon['url']}/usages")).json()["data"]
    assert [a["name"] for a in usages["accounts"]] == ["零錢包"]
    assert [c["name"] for c in usages["categories"]] == ["早餐"]

    deleted = await client.delete(str(icon["url"]))
    assert deleted.status_code == 200
    assert deleted.json()["data"] == {"reset_accounts": 1, "reset_categories": 1}

    acc = (await client.get(f"/api/v1/accounts/{account_uid}")).json()["data"]
    assert acc["icon"] == "other"
    cats = (await client.get("/api/v1/categories", params={"limit": 100})).json()["data"]
    assert next(c for c in cats["items"] if c["category_uid"] == category_uid)["icon"] == "other"
    assert (await client.get(str(icon["url"]))).status_code == 404
    assert (await client.get("/api/v1/icons")).json()["data"]["items"] == []

    # 刪掉的圖示不能再被引用；重新上傳同一張圖會得到新的 uid
    res = await client.patch(f"/api/v1/accounts/{account_uid}", json={"icon": key})
    assert res.status_code == 422
    again = await _upload(client)
    assert again["user_icon_uid"] != icon["user_icon_uid"]


@pytest.mark.parametrize("bad", ["custom:not-a-uuid", f"custom:{uuid.uuid4()}"])
async def test_unknown_custom_icon_rejected(client: AsyncClient, bad: str) -> None:
    await _login(client)
    res = await client.post(
        "/api/v1/accounts",
        json={"name": "錯的", "balance": "0", "color": "#8B6ED6", "icon": bad},
    )
    assert res.status_code == 422


async def test_builtin_icon_keys_still_accepted(client: AsyncClient) -> None:
    await _login(client)
    res = await client.post(
        "/api/v1/accounts",
        json={"name": "現金", "balance": "0", "color": "#8B6ED6", "icon": "wallet"},
    )
    assert res.status_code == 201


async def test_upload_rate_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(icons_api, "UPLOAD_RATE_LIMIT", 1)
    await _login(client)
    await _upload(client)
    res = await _send(client, "/api/v1/icons", _png((5, 5, 5)))
    assert res.status_code == 429


async def test_chunked_upload_without_content_length_is_capped(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """沒有 Content-Length 的串流上傳也要在讀取途中被擋下（不能先整包寫進暫存檔）。"""
    monkeypatch.setattr(icons_api, "MAX_UPLOAD_BYTES", 1024)
    await _login(client)
    boundary = "testboundary"
    head = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\n'
        "Content-Type: image/png\r\n\r\n"
    ).encode()
    sent = 0

    async def body() -> AsyncIterator[bytes]:
        nonlocal sent
        yield head
        for _ in range(200):  # 200 × 64 KB ≈ 12.5 MB，遠超過上限
            sent += 1
            yield b"\0" * 65536

    res = await client.post(
        "/api/v1/icons",
        content=body(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    assert res.status_code == 413
    assert sent < 200  # 讀到上限就中止，沒有把整個 body 讀完


async def test_non_multipart_body_rejected(client: AsyncClient) -> None:
    await _login(client)
    res = await client.post("/api/v1/icons", content=b"x", headers={"Content-Type": "image/png"})
    assert res.status_code == 422
