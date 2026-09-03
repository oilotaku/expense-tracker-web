"""安全 header 的機械驗證（CORE-128）。

模板產物必須自己證明「前後端都有 CSP」，不能只寫在規範裡。
"""

from httpx import AsyncClient

from app.core.middleware import DOCS_CSP, SECURE_HEADERS


async def test_baseline_headers_present(client: AsyncClient) -> None:
    res = await client.get("/api/v1/health")
    for name, value in SECURE_HEADERS.items():
        assert res.headers[name] == value


async def test_api_csp_is_locked_down(client: AsyncClient) -> None:
    res = await client.get("/api/v1/health")
    csp = res.headers["Content-Security-Policy"]
    assert "default-src 'none'" in csp
    assert "frame-ancestors 'none'" in csp
    assert "base-uri 'none'" in csp
    # API 基線不得放行任何 script 來源
    assert "script-src" not in csp


async def test_docs_csp_allows_swagger_assets_only() -> None:
    # docs 用的放寬版本仍然關掉 frame-ancestors / base-uri，且只放行 jsdelivr
    assert "frame-ancestors 'none'" in DOCS_CSP
    assert "base-uri 'none'" in DOCS_CSP
    assert "https://cdn.jsdelivr.net" in DOCS_CSP
    assert "'unsafe-eval'" not in DOCS_CSP


async def test_hsts_absent_in_development(client: AsyncClient) -> None:
    # development 不送 HSTS（本機 http），staging / production 才送
    res = await client.get("/api/v1/health")
    assert "Strict-Transport-Security" not in res.headers
