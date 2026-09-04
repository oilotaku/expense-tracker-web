"""時間唯一入口：內部層 UTC，API 邊界轉 Settings.API_TZ（harness rules/00-core/03-timezone.md）。"""

from datetime import UTC, datetime, timedelta
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


def period_bounds_utc(period_type: str) -> tuple[datetime, datetime]:
    """回傳「當日」或「當月」在 API_TZ 下的日曆邊界，轉為 UTC 的 `[start, end)` 半開區間。

    邊界依本地日曆天 / 月計算（非 UTC 天界，→ CORE-041）；service / repository 只消費這裡
    已轉換好的 UTC 區間，不得自行用 `ZoneInfo(settings.API_TZ)` 換算（→ CORE-043）。
    """
    local_now = now_utc().astimezone(API_TZ)
    start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period_type == "daily":
        end_local = start_local + timedelta(days=1)
    else:
        start_local = start_local.replace(day=1)
        if start_local.month == 12:
            end_local = start_local.replace(year=start_local.year + 1, month=1)
        else:
            end_local = start_local.replace(month=start_local.month + 1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)
