"""台股每日收盤價快照（→ ADR-0007）：不歸屬使用者，同股號同交易日只留一列。

由每個交易日收盤後的內部排程（`POST /internal/stock-close/run`）寫入；淨資產在非盤中時段
優先讀這裡，盤中即時報價失敗時也退回這裡的最近一筆。
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Date, DateTime, Index, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, public_uid


class StockClosePrice(BaseModel):
    __tablename__ = "stock_close_prices"

    stock_close_price_uid: Mapped[UUID] = public_uid()
    ticker: Mapped[str] = mapped_column(String(16), nullable=False)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    close_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # 最後一次從 MIS 抓到這筆的時間（UTC）；休市日重抓同一交易日也會更新，用來判斷
    # 「這份收盤價是不是在最近一次收盤之後才抓的」。
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index(
            "uq_stock_close_prices_ticker_trade_date",
            "ticker",
            "trade_date",
            unique=True,
            postgresql_where=text("is_deleted = false"),
        ),
    )
