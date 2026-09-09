"""支援的帳戶幣別清單：固定選單而非任意 ISO 4217 代碼。

`app.clients.metal_price_client.ExchangeRateClient` 底層其實支援任意 ISO 代碼，這裡用固定
選單純粹是 UX 考量（避免自由輸入打錯代碼），不是外部服務的限制。多幣別功能在
`docs/Tasks/v1.0.0/propose-v1.0.0.md`／`v1.1.0/propose-v1.1.0.md` 都明確排除過（「本版預設
新台幣」），這裡是使用者主動要求翻案。
"""

from enum import StrEnum


class SupportedCurrency(StrEnum):
    TWD = "TWD"
    USD = "USD"
    JPY = "JPY"
    EUR = "EUR"
    CNY = "CNY"
    HKD = "HKD"
    GBP = "GBP"
    AUD = "AUD"
    KRW = "KRW"
    THB = "THB"
