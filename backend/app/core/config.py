from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# 只供 APP_ENV=development 且未設 JWT_SECRET_KEY 時使用；長度 ≥ 32，非 example 佔位，非真實金鑰。
JWT_SECRET_KEY_DEVELOPMENT_DEFAULT = "development-only-jwt-secret-do-not-use-outside-dev"
EXAMPLE_PLACEHOLDER = "<generate-32-bytes-hex>"


class Settings(BaseSettings):
    # 容器內由 compose env_file 注入；CI 以環境變數提供
    model_config = SettingsConfigDict(extra="ignore")

    APP_NAME: str = "expense-tracker-web"
    APP_ENV: Literal["development", "staging", "production"] = "development"
    DATABASE_URL: str
    JWT_SECRET_KEY: str = Field(default=JWT_SECRET_KEY_DEVELOPMENT_DEFAULT, min_length=32)
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    # 報價快取（→ rules/40-cache）；純加速型快取，未設定時 app 仍可啟動（→ CACHE-006）
    REDIS_URL: str | None = None
    # API 邊界（request / response）時區；內部層一律 UTC（harness rules/00-core/03-timezone.md）
    API_TZ: str = "Asia/Taipei"
    # 後端只回 JSON，CSP 基線鎖到 default-src 'none'（CORE-128）。
    # 要依專案放寬就設 env CSP_POLICY，不改程式碼；/api/docs 的放寬版本在 core/middleware.py。
    CSP_POLICY: str = (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    )

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"

    @model_validator(mode="after")
    def _fail_fast(self) -> Settings:
        # 任何環境都不接受 example 佔位（cp .env.*.example 忘了改）
        for name in ("JWT_SECRET_KEY", "DATABASE_URL"):
            if EXAMPLE_PLACEHOLDER in getattr(self, name):
                raise ValueError(f"{name} 仍為範本佔位 {EXAMPLE_PLACEHOLDER}，請填入實際值")
        # 非 development 一律拒絕 development 預設值
        if not self.is_development and self.JWT_SECRET_KEY == JWT_SECRET_KEY_DEVELOPMENT_DEFAULT:
            raise ValueError(f"APP_ENV={self.APP_ENV} 但 JWT_SECRET_KEY 仍為 development 預設值")
        # use_redis=true 專案在 production 必設 REDIS_URL（→ CACHE-006）
        if self.APP_ENV == "production" and not self.REDIS_URL:
            raise ValueError("APP_ENV=production 但 REDIS_URL 未設定")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
