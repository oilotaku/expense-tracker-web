"""所有 request / response schema 的基底：datetime 在 API 邊界做 UTC ↔ API_TZ 轉換。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_serializer, field_validator

from app.utils.datetime import to_api_tz, to_utc


class ApiSchema(BaseModel):
    """response：所有 datetime 欄位序列化為 API_TZ（+08:00）。"""

    # json_schema_mode_override：wildcard field_serializer 的回傳註解（object）會把 serialization
    # 模式的 JSON schema 蓋成 {}，OpenAPI / openapi-typescript 只剩 unknown；固定用 validation 模式
    model_config = ConfigDict(from_attributes=True, json_schema_mode_override="validation")

    @field_serializer("*", when_used="json")
    def _dt_to_api_tz(self, v: object) -> object:
        return to_api_tz(v) if isinstance(v, datetime) else v


class ApiInput(BaseModel):
    """request：aware datetime 轉 UTC；naive 直接 422。"""

    @field_validator("*", mode="after")
    @classmethod
    def _dt_to_utc(cls, v: object) -> object:
        return to_utc(v) if isinstance(v, datetime) else v
