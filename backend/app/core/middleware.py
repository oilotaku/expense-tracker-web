from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response

from app.core.config import Settings

SECURE_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
}
HSTS_HEADER = "max-age=31536000; includeSubDomains"

# /api/docs 的 Swagger UI 由 CDN 載入 JS / CSS，套 API 基線（default-src 'none'）會整頁白畫面。
# docs 只在 development 開啟（main.py 的 docs_enabled），所以這條放寬只會出現在 dev。
DOCS_CSP = (
    "default-src 'none'; "
    "script-src 'self' https://cdn.jsdelivr.net; "
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "font-src 'self' https://cdn.jsdelivr.net; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)
DOCS_PATH_PREFIXES = ("/api/docs", "/api/redoc", "/api/openapi.json")


def register_secure_headers(app: FastAPI, settings: Settings) -> None:
    """回應一律帶安全 header（CORE-128）。

    CSP 基線走 `Settings.CSP_POLICY`，專案要放寬就改 env `CSP_POLICY`，不必改程式碼。
    後端只回 JSON，所以基線是 `default-src 'none'`：任何被誤當成 HTML 渲染的回應都無法載入資源。
    """
    hsts_enabled = not settings.is_development
    api_csp = settings.CSP_POLICY

    @app.middleware("http")
    async def _secure_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        for name, value in SECURE_HEADERS.items():
            response.headers.setdefault(name, value)
        is_docs = request.url.path.startswith(DOCS_PATH_PREFIXES)
        response.headers.setdefault("Content-Security-Policy", DOCS_CSP if is_docs else api_csp)
        if hsts_enabled:
            response.headers.setdefault("Strict-Transport-Security", HSTS_HEADER)
        return response
