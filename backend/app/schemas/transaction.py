"""交易 request / response schema：金額一律 Decimal（DB-038），標籤以名稱傳入並 get-or-create。"""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, field_serializer, model_validator
from pydantic.functional_validators import AfterValidator

from app.models.transaction import TransactionType, TransferDirection
from app.schemas.base import ApiInput, ApiSchema

_NonTransferType = Literal[TransactionType.INCOME, TransactionType.EXPENSE]
_ACCOUNTS_SAME_DETAIL = "轉出與轉入帳戶不可相同"


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
    # 轉帳（transfer）不走這支：沒有分類、需要兩個帳戶，一律走 TransferCreateRequest /
    # POST /transactions/transfer，這裡用型別直接收窄成 income/expense，不需要額外 runtime 檢查。
    transaction_type: _NonTransferType
    payment_method: str = Field(max_length=50)
    tags: TagNameList = Field(default_factory=list)


class TransactionUpdateRequest(ApiInput):
    account_uid: UUID | None = None
    category_uid: UUID | None = None
    transaction_date: datetime | None = None
    description: str | None = Field(default=None, max_length=255)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=2)
    transaction_type: _NonTransferType | None = None
    payment_method: str | None = Field(default=None, max_length=50)
    # None = 標籤維持不變；提供的清單（含空清單）會整批取代既有標籤
    tags: TagNameList | None = None


class TransferCreateRequest(ApiInput):
    from_account_uid: UUID
    to_account_uid: UUID
    transaction_date: datetime
    description: str = Field(max_length=255)
    amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    payment_method: str = Field(max_length=50)

    @model_validator(mode="after")
    def _validate_accounts_differ(self) -> TransferCreateRequest:
        if self.from_account_uid == self.to_account_uid:
            raise ValueError(_ACCOUNTS_SAME_DETAIL)
        return self


class TransferUpdateRequest(ApiInput):
    from_account_uid: UUID | None = None
    to_account_uid: UUID | None = None
    transaction_date: datetime | None = None
    description: str | None = Field(default=None, max_length=255)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=2)
    payment_method: str | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def _validate_accounts_differ(self) -> TransferUpdateRequest:
        if (
            self.from_account_uid is not None
            and self.to_account_uid is not None
            and self.from_account_uid == self.to_account_uid
        ):
            raise ValueError(_ACCOUNTS_SAME_DETAIL)
        return self


class TransactionListFilter(ApiInput):
    category_uid: UUID | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class TransactionResponse(ApiSchema):
    transaction_uid: UUID
    account_uid: UUID
    # 轉帳列沒有分類（→ ck_transactions_transfer_shape），一般收支交易仍恆有值。
    category_uid: UUID | None
    transaction_date: datetime
    description: str
    amount: Decimal
    transaction_type: TransactionType
    payment_method: str
    tags: list[TagResponse]
    # 以下三個欄位只有轉帳列（transaction_type == transfer）才有值，一般收支交易恆為 None。
    transfer_group_uid: UUID | None = None
    transfer_direction: TransferDirection | None = None
    # 「這一列」的對方帳戶 uid（OUT 列填目標帳戶、IN 列填來源帳戶），讓前端不用額外打 API
    # 就能顯示「A 帳戶 → B 帳戶」（→ TransactionList.tsx 既有的 accountNameByUid 查表）。
    transfer_counterpart_account_uid: UUID | None = None

    @field_serializer("amount", when_used="json")
    def _amount_to_str(self, v: Decimal) -> str:
        return str(v)


class TransactionListResponse(ApiSchema):
    items: list[TransactionResponse]
    total: int


class TransferResponse(ApiSchema):
    outbound: TransactionResponse
    inbound: TransactionResponse
