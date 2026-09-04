from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.repositories.category_repository import CategoryRepository

_PASSWORD = "correct horse battery"

# 與 backend/alembic/versions/2026_09_04_1701-add_subscription_category.py 的
# _BACKFILL_SUBSCRIPTION_SQL 同一份公式（migration 內不 import app model，測試端直接複製
# 字串以驗證該公式本身的冪等與避碰撞行為，兩處保持一致）。
_BACKFILL_SUBSCRIPTION_SQL = """
INSERT INTO categories (user_uid, name, color, icon)
SELECT
    u.user_uid,
    '訂閱',
    (ARRAY[
        '#8B6ED6', '#E8834B', '#2FA98A', '#D9A428',
        '#3E8FD0', '#D65FA0', '#8AAE3C', '#5A4FA0'
    ])[(abs(('x' || substr(md5('訂閱'), 1, 8))::bit(32)::int) % 8) + 1],
    'other'
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM categories c WHERE c.user_uid = u.user_uid AND c.name = '訂閱'
);
"""


async def _register_and_login(client: AsyncClient, email: str) -> UUID:
    payload = {"email": email, "password": _PASSWORD}
    register_res = await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200
    return UUID(register_res.json()["data"]["user_uid"])


async def test_new_user_gets_default_categories(client: AsyncClient) -> None:
    await _register_and_login(client, "cat-user-1@example.com")

    res = await client.get("/api/v1/categories")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["data"]["total"] > 0
    assert len(body["data"]["items"]) == body["data"]["total"]
    names = {item["name"] for item in body["data"]["items"]}
    assert "餐飲" in names
    assert "其他" in names
    assert "訂閱" in names
    for item in body["data"]["items"]:
        assert item["color"]
        assert item["icon"]


async def test_new_user_default_categories_seeded_in_correct_order(
    client: AsyncClient, db: AsyncSession
) -> None:
    user_uid = await _register_and_login(client, "cat-order-1@example.com")

    stmt = select(Category.name).where(Category.user_uid == user_uid).order_by(Category.uid)
    names = list((await db.execute(stmt)).scalars().all())
    assert names == ["餐飲", "交通", "娛樂", "購物", "醫療", "居住", "訂閱", "薪資", "其他"]


async def test_list_categories_without_cookie_returns_401(client: AsyncClient) -> None:
    res = await client.get("/api/v1/categories")
    assert res.status_code == 401
    assert res.json()["success"] is False


async def test_create_category(client: AsyncClient) -> None:
    await _register_and_login(client, "cat-user-2@example.com")

    before = (await client.get("/api/v1/categories")).json()["data"]["total"]

    res = await client.post(
        "/api/v1/categories", json={"name": "投資", "color": "#8B6ED6", "icon": "chart"}
    )
    assert res.status_code == 201
    body = res.json()
    assert body["success"] is True
    assert body["data"]["name"] == "投資"
    assert body["data"]["color"] == "#8B6ED6"
    assert body["data"]["icon"] == "chart"

    after = (await client.get("/api/v1/categories")).json()["data"]["total"]
    assert after == before + 1


async def test_create_category_invalid_color_returns_422(client: AsyncClient) -> None:
    await _register_and_login(client, "cat-user-2b@example.com")

    res = await client.post(
        "/api/v1/categories", json={"name": "投資", "color": "not-a-color", "icon": "chart"}
    )
    assert res.status_code == 422


async def test_create_duplicate_category_name_returns_409(client: AsyncClient) -> None:
    await _register_and_login(client, "cat-user-3@example.com")

    payload = {"name": "訂閱服務", "color": "#E8834B", "icon": "bell"}
    first = await client.post("/api/v1/categories", json=payload)
    assert first.status_code == 201

    second = await client.post("/api/v1/categories", json=payload)
    assert second.status_code == 409
    assert second.json()["success"] is False


async def test_update_category_renames_it(client: AsyncClient) -> None:
    await _register_and_login(client, "cat-user-4@example.com")

    created = await client.post(
        "/api/v1/categories", json={"name": "舊名稱", "color": "#2FA98A", "icon": "tag"}
    )
    category_uid = created.json()["data"]["category_uid"]

    res = await client.patch(f"/api/v1/categories/{category_uid}", json={"name": "新名稱"})
    assert res.status_code == 200
    assert res.json()["data"]["name"] == "新名稱"
    # 只改名，color/icon 不受影響
    assert res.json()["data"]["color"] == "#2FA98A"
    assert res.json()["data"]["icon"] == "tag"


async def test_update_category_color_and_icon_without_renaming(client: AsyncClient) -> None:
    await _register_and_login(client, "cat-user-4b@example.com")

    created = await client.post(
        "/api/v1/categories", json={"name": "水電", "color": "#D9A428", "icon": "bolt"}
    )
    category_uid = created.json()["data"]["category_uid"]

    res = await client.patch(
        f"/api/v1/categories/{category_uid}", json={"color": "#3E8FD0", "icon": "droplet"}
    )
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["name"] == "水電"
    assert body["color"] == "#3E8FD0"
    assert body["icon"] == "droplet"


async def test_delete_category_is_soft_delete_and_disappears_from_list(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "cat-user-5@example.com")

    created = await client.post(
        "/api/v1/categories", json={"name": "待刪除", "color": "#D65FA0", "icon": "trash"}
    )
    category_uid = created.json()["data"]["category_uid"]

    delete_res = await client.delete(f"/api/v1/categories/{category_uid}")
    assert delete_res.status_code == 200
    assert delete_res.json()["success"] is True

    list_res = await client.get("/api/v1/categories")
    names = {item["name"] for item in list_res.json()["data"]["items"]}
    assert "待刪除" not in names

    # 已軟刪對 API 而言等同不存在：再次操作回 404，不洩漏「曾經存在」（→ DB-021）
    second_delete = await client.delete(f"/api/v1/categories/{category_uid}")
    assert second_delete.status_code == 404


async def test_categories_are_scoped_to_owner(client: AsyncClient) -> None:
    await _register_and_login(client, "cat-owner-a@example.com")
    created = await client.post(
        "/api/v1/categories", json={"name": "只屬於 A", "color": "#8AAE3C", "icon": "lock"}
    )
    category_uid = created.json()["data"]["category_uid"]

    await _register_and_login(client, "cat-owner-b@example.com")

    # user B 看不到 user A 的分類清單
    list_res = await client.get("/api/v1/categories")
    names = {item["name"] for item in list_res.json()["data"]["items"]}
    assert "只屬於 A" not in names

    # user B 對 user A 的 category_uid 操作回 404，不是 403（不洩漏存在性）
    update_res = await client.patch(f"/api/v1/categories/{category_uid}", json={"name": "被 B 改"})
    assert update_res.status_code == 404


async def test_subscription_backfill_inserts_for_user_missing_it(
    client: AsyncClient, db: AsyncSession
) -> None:
    """模擬既有使用者升級（本身已有其餘 8 個系統分類，缺「訂閱」）：backfill 應補上。"""
    user_uid = await _register_and_login(client, "cat-sub-missing@example.com")
    await db.execute(delete(Category).where(Category.user_uid == user_uid, Category.name == "訂閱"))
    await db.flush()

    await db.execute(text(_BACKFILL_SUBSCRIPTION_SQL))

    categories, _total = await CategoryRepository(db).list_by_user_uid(user_uid, limit=100)
    names = {c.name for c in categories}
    assert "訂閱" in names


async def test_subscription_backfill_skips_user_with_manual_subscription_category(
    client: AsyncClient, db: AsyncSession
) -> None:
    """已手動建立同名「訂閱」分類的使用者升級不應觸發 unique constraint 衝突，也不應重複建立。"""
    user_uid = await _register_and_login(client, "cat-sub-manual@example.com")
    await db.execute(delete(Category).where(Category.user_uid == user_uid, Category.name == "訂閱"))
    await db.flush()
    await CategoryRepository(db).create(user_uid, "訂閱", "#111111", "custom-icon")

    # 不應拋 IntegrityError
    await db.execute(text(_BACKFILL_SUBSCRIPTION_SQL))

    categories, _total = await CategoryRepository(db).list_by_user_uid(user_uid, limit=100)
    subscription_categories = [c for c in categories if c.name == "訂閱"]
    assert len(subscription_categories) == 1
    assert subscription_categories[0].color == "#111111"
