from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

# 索引 / 約束命名（harness rules/30-database DB-007..009）；Alembic autogenerate 自動套用
NAMING_CONVENTION = {
    "ix": "idx_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "fk": "fk_%(table_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def _build_engine() -> AsyncEngine:
    # 連線池參數的規範見 harness rules/30-database（connection）
    return create_async_engine(
        get_settings().DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_recycle=300,
        pool_pre_ping=True,
        # 儲存層一律 UTC（harness rules/00-core/03-timezone.md）
        connect_args={"server_settings": {"timezone": "UTC"}},
    )


engine: AsyncEngine = _build_engine()
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
