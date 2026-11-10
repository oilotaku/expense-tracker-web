from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.stock_price_client import StockQuote
from app.models.financial_asset import FinancialAsset
from app.models.stock_close_price import StockClosePrice


class StockClosePriceRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_held_tickers(self) -> list[str]:
        """所有使用者目前持有（未軟刪）的台股股號，去重排序。"""
        stmt = (
            select(FinancialAsset.name)
            .where(FinancialAsset.asset_type == "stock", FinancialAsset.is_deleted.is_(False))
            .distinct()
            .order_by(FinancialAsset.name)
        )
        return list((await self.db.scalars(stmt)).all())

    async def upsert(self, quotes: Sequence[StockQuote], fetched_at: datetime) -> int:
        """同股號同交易日已存在就覆寫價格與 `fetched_at`；沒有 `trade_date` 的報價略過。"""
        rows = [
            {
                "ticker": q.ticker,
                "trade_date": q.trade_date,
                "close_price": q.price,
                "name": q.name,
                "fetched_at": fetched_at,
            }
            for q in quotes
            if q.trade_date is not None
        ]
        if not rows:
            return 0
        stmt = insert(StockClosePrice).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["ticker", "trade_date"],
            index_where=text("is_deleted = false"),
            set_={
                "close_price": stmt.excluded.close_price,
                "name": stmt.excluded.name,
                "fetched_at": stmt.excluded.fetched_at,
                "updated_at": fetched_at,
            },
        )
        await self.db.execute(stmt)
        return len(rows)

    async def latest_by_tickers(self, tickers: Sequence[str]) -> dict[str, StockClosePrice]:
        """每檔股號最新交易日的一列（DISTINCT ON）。"""
        if not tickers:
            return {}
        stmt = (
            select(StockClosePrice)
            .where(StockClosePrice.ticker.in_(tickers), StockClosePrice.is_deleted.is_(False))
            .distinct(StockClosePrice.ticker)
            .order_by(StockClosePrice.ticker, StockClosePrice.trade_date.desc())
        )
        return {row.ticker: row for row in (await self.db.scalars(stmt)).all()}
