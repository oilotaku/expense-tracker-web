import type { TransactionType } from '@/lib/api/transactionsApi'

/**
 * 金額顯示格式化（design-spec §9.2 wireframe 的 `NT$45,000` / `+NT$17,000` 寫法）。
 *
 * 後端 Decimal 一律以字串傳遞（DB-038），這裡的 `Number()` **只**用於顯示層的千分位與正負號，
 * 不回寫任何請求；無法解析時原樣輸出，避免出現 `NaN`。
 */
export function formatAmount(value: string, signed = false): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value
  const absolute = Math.abs(amount).toLocaleString('zh-Hant-TW', { maximumFractionDigits: 0 })
  const sign = amount < 0 ? '-' : signed && amount > 0 ? '+' : ''
  return `${sign}NT$${absolute}`
}

const TRANSACTION_AMOUNT_SIGN: Record<TransactionType, string> = {
  income: '+',
  expense: '-',
  transfer: '',
}

/** 交易金額的顯示正負號：收入 `+`、支出 `-`、轉帳不分方向不加號（design-spec §9.3，fixed.md §27）。 */
export function transactionAmountSign(type: TransactionType): string {
  return TRANSACTION_AMOUNT_SIGN[type]
}
