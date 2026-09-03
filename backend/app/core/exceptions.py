import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.response import failure

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(
        self,
        detail: str,
        response_code: int = 400,
        status_code: int = 400,
        error_code: str | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.response_code = response_code
        self.status_code = status_code
        self.error_code = error_code


# 常用子類（BE-048）；response_code 一律等於 HTTP status（BE-018）
class NotFoundError(AppError):
    def __init__(self, detail: str = "資源不存在") -> None:
        super().__init__(detail, response_code=404, status_code=404)


class ConflictError(AppError):
    def __init__(self, detail: str = "資源衝突") -> None:
        super().__init__(detail, response_code=409, status_code=409)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        return failure(
            detail=exc.detail, response_code=exc.response_code, status_code=exc.status_code
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        return failure(detail="輸入驗證失敗", response_code=422, status_code=422)

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        # 不把例外內容回給 client；細節只進 log
        logger.exception("Unexpected error at %s %s", request.method, request.url.path)
        return failure(detail="伺服器發生錯誤，請稍後再試", response_code=500, status_code=500)
