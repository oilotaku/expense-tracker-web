from datetime import datetime
from typing import ClassVar
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, Boolean, DateTime, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, MappedColumn, Synonym, mapped_column, synonym

from app.core.db import Base


def public_uid() -> MappedColumn[UUID]:
    """對外識別碼欄位工廠：每張業務表宣告一次 `<單數表名>_uid: Mapped[UUID] = public_uid()`。

    外鍵 / API / log / cache key 一律用它；規範見 harness rules/30-database/01-identifiers.md。
    """
    return mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        unique=True,
        index=True,
        default=uuid4,
        server_default=text("gen_random_uuid()"),
        info={"public_uid": True},
    )


class BaseModel(Base):
    """所有業務 model 的共同欄位。

    `uid` 為內部自增主鍵，不對外；時間一律 TIMESTAMPTZ 且儲存 UTC
    （harness rules/00-core/03-timezone.md）。
    """

    __abstract__ = True
    # 預設 f"{__tablename__ 去尾 s}_uid"；不規則複數（categories）在 model 覆寫
    # __public_uid__ = "category_uid"
    __public_uid__: ClassVar[str]
    # 泛型 Repository 用：self.model.public_uid == x
    public_uid: ClassVar[Synonym[UUID]]

    uid: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True, sort_order=-1
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    # 單人 / 尚無使用者系統時允許 NULL；接上 auth 後再改 nullable=False（值為 users.user_uid）
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    def __init_subclass__(cls, **kwargs: object) -> None:
        if not cls.__dict__.get("__abstract__", False):
            default_name = f"{cls.__tablename__.removesuffix('s')}_uid"
            expected = cls.__dict__.get("__public_uid__") or default_name
            found = [
                k
                for k, v in cls.__dict__.items()
                if isinstance(v, MappedColumn) and v.column.info.get("public_uid")
            ]
            if found != [expected]:
                raise TypeError(
                    f"{cls.__name__}: 需恰有一個 `{expected}: Mapped[UUID] = public_uid()`，"
                    f"實際 {found}"
                )
            cls.__public_uid__ = expected
            cls.public_uid = synonym(expected)
        super().__init_subclass__(**kwargs)
