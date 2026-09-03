from httpx import AsyncClient

_PASSWORD = "correct horse battery"


async def _register_and_login(client: AsyncClient, email: str) -> None:
    payload = {"email": email, "password": _PASSWORD}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200


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


async def test_list_categories_without_cookie_returns_401(client: AsyncClient) -> None:
    res = await client.get("/api/v1/categories")
    assert res.status_code == 401
    assert res.json()["success"] is False


async def test_create_category(client: AsyncClient) -> None:
    await _register_and_login(client, "cat-user-2@example.com")

    before = (await client.get("/api/v1/categories")).json()["data"]["total"]

    res = await client.post("/api/v1/categories", json={"name": "投資"})
    assert res.status_code == 201
    body = res.json()
    assert body["success"] is True
    assert body["data"]["name"] == "投資"

    after = (await client.get("/api/v1/categories")).json()["data"]["total"]
    assert after == before + 1


async def test_create_duplicate_category_name_returns_409(client: AsyncClient) -> None:
    await _register_and_login(client, "cat-user-3@example.com")

    first = await client.post("/api/v1/categories", json={"name": "訂閱服務"})
    assert first.status_code == 201

    second = await client.post("/api/v1/categories", json={"name": "訂閱服務"})
    assert second.status_code == 409
    assert second.json()["success"] is False


async def test_update_category_renames_it(client: AsyncClient) -> None:
    await _register_and_login(client, "cat-user-4@example.com")

    created = await client.post("/api/v1/categories", json={"name": "舊名稱"})
    category_uid = created.json()["data"]["category_uid"]

    res = await client.patch(f"/api/v1/categories/{category_uid}", json={"name": "新名稱"})
    assert res.status_code == 200
    assert res.json()["data"]["name"] == "新名稱"


async def test_delete_category_is_soft_delete_and_disappears_from_list(
    client: AsyncClient,
) -> None:
    await _register_and_login(client, "cat-user-5@example.com")

    created = await client.post("/api/v1/categories", json={"name": "待刪除"})
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
    created = await client.post("/api/v1/categories", json={"name": "只屬於 A"})
    category_uid = created.json()["data"]["category_uid"]

    await _register_and_login(client, "cat-owner-b@example.com")

    # user B 看不到 user A 的分類清單
    list_res = await client.get("/api/v1/categories")
    names = {item["name"] for item in list_res.json()["data"]["items"]}
    assert "只屬於 A" not in names

    # user B 對 user A 的 category_uid 操作回 404，不是 403（不洩漏存在性）
    update_res = await client.patch(f"/api/v1/categories/{category_uid}", json={"name": "被 B 改"})
    assert update_res.status_code == 404
