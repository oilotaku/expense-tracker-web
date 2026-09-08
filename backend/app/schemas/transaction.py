"""交易 request / response schema：金額一律 Decimal（DB-038），標籤以名稱傳入並 get-or-create。"""

from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import Field, field_serializer
from pydantic.functional_validators import AfterValidator

from app.models.transaction import TransactionType
from app.schemas.base import ApiInput, ApiSchema


def _dedupe_tag_names(names: list[str]) -> list[str]:
    stripped = [n.strip() for n in names]
    if any(not n for n in stripped):
        raise ValueError("標籤名稱不可為空白")
    seen: dict[str, None] = {}
    for name in stripped:
        seen.setdefault(name, None)
    return list(seen.keys())


TagNameList = Annotated[list[str], AfterValidator(_dedupe_tag_names)]


class TagResponse(ApiSchema):
    tag_uid: UUID
    name: str


class TransactionCreateRequest(ApiInput):
    account_uid: UUID
    category_uid: UUID
    transaction_date: datetime
    description: str = Field(max_length=255)
    amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    transaction_type: TransactionType
    payment_method: str = Field(max_length=50)
    tags: TagNameList = Field(default_factory=list)


class TransactionUpdateRequest(ApiInput):
    account_uid: UUID | None = None
    category_uid: UUID | None = None
    transaction_date: datetime | None = None
    description: str | None = Field(default=None, max_length=255)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=2)
    transaction_type: TransactionType | None = None
    payment_method: str | None = Field(default=None, max_length=50)
    # None = 標籤維持不變；提供的清單（含空清單）會整批取代既有標籤
    tags: TagNameList | None = None


class TransactionListFilter(ApiInput):
    category_uid: UUID | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class TransactionResponse(ApiSchema):
    transaction_uid: UUID
    account_uid: UUID
    category_uid: UUID
    transaction_date: datetime
    description: str
    amount: Decimal
    transaction_type: TransactionType
    payment_method: str
    tags: list[TagResponse]

    @field_serializer("amount", when_used="json")
    def _amount_to_str(self, v: Decimal) -> str:
        return str(v)


class TransactionListResponse(ApiSchema):
    items: list[TransactionResponse]
    total: int
