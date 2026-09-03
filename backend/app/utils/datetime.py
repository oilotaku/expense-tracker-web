"""時間唯一入口：內部層 UTC，API 邊界轉 Settings.API_TZ（harness rules/00-core/03-timezone.md）。"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.core.config import get_settings

API_TZ = ZoneInfo(get_settings().API_TZ)


def now_utc() -> datetime:
    return datetime.now(UTC)


def to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        raise ValueError("naive datetime not allowed")
    return dt.astimezone(UTC)


def to_api_tz(dt: datetime) -> datetime:
    return to_utc(dt).astimezone(API_TZ)
