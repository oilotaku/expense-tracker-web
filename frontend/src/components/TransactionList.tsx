'use client'

import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { baseApi } from '@/lib/api/baseApi'
import { unwrapData, type ApiResponse } from '@/lib/api/types'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CurvedCard } from '@/components/common/CurvedCard'
import { Dialog } from '@/components/common/Dialog'
import {
  TransactionFormDialog,
  type TransactionFormInitialValues,
  type TransactionFormValues,
} from '@/components/transactions/TransactionFormDialog'
import {
  useListAccountOptionsQuery,
  useListCategoryOptionsQuery,
  useListTransactionsQuery,
  type AccountOption,
  type CategoryOption,
  type TransactionResponse,
  type TransactionType,
} from '@/lib/api/transactionsApi'
import { formatDate } from '@/utils/datetime'

// 顯示時區固定 Asia/Taipei、全年 +08:00 無 DST（→ CORE-041）；期間篩選的 <input type="date">
// 只給純日期（無 offset），送出前轉成該日的起 / 迄時刻 ISO 字串（同
// TransactionFormDialog.tsx 的 dateInputToApiDatetime 為同一轉換邏輯的區間特化版本）。
const API_TZ_OFFSET = '+08:00'

function dateFromStartOfDayIso(date: string): string {
  return `${date}T00:00:00${API_TZ_OFFSET}`
}

function dateToEndOfDayIso(date: string): string {
  return `${date}T23:59:59${API_TZ_OFFSET}`
}

function getErrorMessage(error: FetchBaseQueryError | SerializedError | undefined): string {
  if (!error) return ''
  if ('status' in error) {
    const data = error.data
    if (
      data !== null &&
      typeof data === 'object' &&
      'detail' in data &&
      typeof data.detail === 'string'
    ) {
      return data.detail
    }
    return '發生錯誤，請稍後再試'
  }
  return error.message ?? '發生錯誤，請稍後再試'
}

// `frontend/src/lib/api/transactionsApi.ts` 不在本 task（task-017）的 affected_files 內。後端
// PATCH/DELETE /transactions/{uid} 已存在（backend/app/api/v1/transactions.py），但前端該檔尚未
// 補上對應 mutation，且新增該 export 需要修改 transactionsApi.ts，超出本 task 授權範圍。這裡改用
// `baseApi.injectEndpoints` 就地掛在同一個 'api' reducer 上（FE-021「全專案唯一 createApi」的
// 精神仍成立：同一個 baseApi 實例），沿用 transactionsApi.ts 已註冊的 'Transaction' tag 做
// invalidate（→ accountsApi.ts 沿用同一機制的既有慣例）。不新增檔案、不修改 transactionsApi.ts。
export interface TransactionUpdateRequest {
  transactionUid: string
  account_uid: string
  category_uid: string
  transaction_date: string
  description: string
  amount: string
  transaction_type: TransactionType
  payment_method: string
}

const transactionMutationsApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['Transaction'] })
  .injectEndpoints({
    endpoints: (build) => ({
      updateTransaction: build.mutation<TransactionResponse, TransactionUpdateRequest>({
        query: ({ transactionUid, ...body }) => ({
          url: `transactions/${transactionUid}`,
          method: 'PATCH',
          // tags 刻意不送出：後端 TransactionUpdateRequest.tags 為 None 時「標籤維持不變」，
          // 本頁編輯表單（TransactionFormDialog）沒有標籤欄位，送空陣列會誤清空既有標籤。
          body,
        }),
        transformResponse: (res: ApiResponse<TransactionResponse>) => unwrapData(res),
        invalidatesTags: (_result, _error, { transactionUid }) => [
          { type: 'Transaction' as const, id: transactionUid },
          { type: 'Transaction' as const, id: 'LIST' },
        ],
      }),
      deleteTransaction: build.mutation<void, string>({
        query: (transactionUid) => ({ url: `transactions/${transactionUid}`, method: 'DELETE' }),
        // 刪除成功回應為 ApiResponse[None]（data 恆為 null），與「data 為 null 視為錯誤」的
        // unwrapData 語意衝突（→ accountsApi.ts deleteAccount 同寫法），不經 unwrapData。
        transformResponse: () => undefined,
        invalidatesTags: (_result, _error, transactionUid) => [
          { type: 'Transaction' as const, id: transactionUid },
          { type: 'Transaction' as const, id: 'LIST' },
        ],
      }),
    }),
    overrideExisting: false,
  })

const { useUpdateTransactionMutation, useDeleteTransactionMutation } = transactionMutationsApi

const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = { expense: '支出', income: '收入' }

interface TransactionFiltersValue {
  dateFrom: string
  dateTo: string
  categoryUid: string
  accountUid: string
  transactionType: string
}

const EMPTY_FILTERS: TransactionFiltersValue = {
  dateFrom: '',
  dateTo: '',
  categoryUid: '',
  accountUid: '',
  transactionType: '',
}

interface FilterFieldsProps {
  value: TransactionFiltersValue
  categories: CategoryOption[]
  accounts: AccountOption[]
  onChange: (next: TransactionFiltersValue) => void
}

/**
 * 期間/分類/帳戶/類型篩選欄位（design-spec §9.3）：桌機橫向排列直接顯示、行動端收進
 * `<Dialog>` 的 BottomSheet，兩處共用同一份欄位定義（避免 FE-044 重複），只有外層容器不同。
 */
function FilterFields({ value, categories, accounts, onChange }: FilterFieldsProps): ReactNode {
  function handleFieldChange<K extends keyof TransactionFiltersValue>(
    key: K,
  ): (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
      onChange({ ...value, [key]: event.target.value })
    }
  }

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-secondary">起始日期</span>
        <input
          type="date"
          value={value.dateFrom}
          onChange={handleFieldChange('dateFrom')}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-secondary">結束日期</span>
        <input
          type="date"
          value={value.dateTo}
          onChange={handleFieldChange('dateTo')}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-secondary">分類</span>
        <select
          value={value.categoryUid}
          onChange={handleFieldChange('categoryUid')}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
        >
          <option value="">全部分類</option>
          {categories.map((category) => (
            <option key={category.category_uid} value={category.category_uid}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-secondary">帳戶</span>
        <select
          value={value.accountUid}
          onChange={handleFieldChange('accountUid')}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
        >
          <option value="">全部帳戶</option>
          {accounts.map((account) => (
            <option key={account.account_uid} value={account.account_uid}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-secondary">類型</span>
        <select
          value={value.transactionType}
          onChange={handleFieldChange('transactionType')}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
        >
          <option value="">全部類型</option>
          {(Object.entries(TRANSACTION_TYPE_LABEL) as [TransactionType, string][]).map(
            ([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ),
          )}
        </select>
      </label>
    </>
  )
}

interface TransactionRowProps {
  transaction: TransactionResponse
  categoryName: string
  accountName: string
  onEdit: (transaction: TransactionResponse) => void
  onDelete: (transaction: TransactionResponse) => void
}

/** 桌機表格列（design-spec §9.3）：hover（或鍵盤 focus）才顯示編輯/刪除 icon 按鈕。 */
function TransactionTableRow({
  transaction,
  categoryName,
  accountName,
  onEdit,
  onDelete,
}: TransactionRowProps): ReactNode {
  const amountColor =
    transaction.transaction_type === 'income' ? 'text-income-600' : 'text-expense-600'

  return (
    <tr className="group border-b border-border last:border-0">
      <td className="p-2 text-text-primary">{formatDate(transaction.transaction_date)}</td>
      <td className="p-2 text-text-primary">{categoryName}</td>
      <td className="p-2 text-text-primary">{transaction.description}</td>
      <td className={`p-2 font-semibold ${amountColor}`}>{transaction.amount}</td>
      <td className="p-2 text-text-primary">{TRANSACTION_TYPE_LABEL[transaction.transaction_type]}</td>
      <td className="p-2 text-text-primary">{accountName}</td>
      <td className="p-2">
        <div className="flex gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button
            type="button"
            aria-label="編輯"
            onClick={() => onEdit(transaction)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-text-secondary hover:text-text-primary md:h-8 md:w-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            ✎
          </button>
          <button
            type="button"
            aria-label="刪除"
            onClick={() => onDelete(transaction)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-danger-500 hover:text-danger-700 md:h-8 md:w-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            🗑
          </button>
        </div>
      </td>
    </tr>
  )
}

/** 行動端卡片（design-spec §9.3）：日期+分類在上、金額右側大字依收支類型上色、明細/帳戶小字在下。 */
function TransactionCard({
  transaction,
  categoryName,
  accountName,
  onEdit,
  onDelete,
}: TransactionRowProps): ReactNode {
  const amountColor =
    transaction.transaction_type === 'income' ? 'text-income-600' : 'text-expense-600'

  function handleDeleteClick(event: { stopPropagation: () => void }): void {
    event.stopPropagation()
    onDelete(transaction)
  }

  return (
    <CurvedCard padding="sm" interactive onClick={() => onEdit(transaction)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-text-secondary">
            {formatDate(transaction.transaction_date)}・{categoryName}
          </span>
          <span className="text-sm text-text-secondary">
            {transaction.description || '（無明細）'}・{accountName}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-lg font-semibold ${amountColor}`}>{transaction.amount}</span>
          <button
            type="button"
            aria-label="刪除"
            onClick={handleDeleteClick}
            onKeyDown={(event) => event.stopPropagation()}
            className="flex h-11 w-11 items-center justify-center rounded-md text-danger-500 hover:text-danger-700"
          >
            🗑
          </button>
        </div>
      </div>
    </CurvedCard>
  )
}

export function TransactionList(): ReactNode {
  const [filters, setFilters] = useState<TransactionFiltersValue>(EMPTY_FILTERS)
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<TransactionResponse | null>(null)
  const [deletingTransaction, setDeletingTransaction] = useState<TransactionResponse | null>(null)

  const { data: categories } = useListCategoryOptionsQuery()
  const { data: accounts } = useListAccountOptionsQuery()
  const {
    data,
    isLoading,
    error: listError,
  } = useListTransactionsQuery({
    category_uid: filters.categoryUid || undefined,
    date_from: filters.dateFrom ? dateFromStartOfDayIso(filters.dateFrom) : undefined,
    date_to: filters.dateTo ? dateToEndOfDayIso(filters.dateTo) : undefined,
    limit: 100,
  })

  const [updateTransaction] = useUpdateTransactionMutation()
  const [deleteTransaction, { isLoading: isDeleting }] = useDeleteTransactionMutation()

  const categoryNameByUid = useMemo(
    () => new Map((categories ?? []).map((category) => [category.category_uid, category.name])),
    [categories],
  )
  const accountNameByUid = useMemo(
    () => new Map((accounts ?? []).map((account) => [account.account_uid, account.name])),
    [accounts],
  )

  // 帳戶 / 類型篩選在後端 GET /transactions 查詢參數未支援（backend/app/schemas/transaction.py
  // 的 TransactionListFilter 只有 category_uid/date_from/date_to），故在已回傳的頁面內容中就地
  // 過濾；已知限制：符合條件的交易若不在當前分頁內就不會顯示，超出本 task 授權範圍（不可修改
  // backend），已在任務回報中一併說明。
  const items = useMemo(() => {
    const all = data?.items ?? []
    return all.filter(
      (transaction) =>
        (!filters.accountUid || transaction.account_uid === filters.accountUid) &&
        (!filters.transactionType || transaction.transaction_type === filters.transactionType),
    )
  }, [data, filters.accountUid, filters.transactionType])

  async function handleEditSubmit(values: TransactionFormValues): Promise<void> {
    if (!editingTransaction) return
    await updateTransaction({
      transactionUid: editingTransaction.transaction_uid,
      account_uid: values.account_uid,
      category_uid: values.category_uid,
      transaction_date: values.transaction_date,
      description: values.description,
      amount: values.amount,
      transaction_type: values.transaction_type,
      payment_method: values.payment_method,
    }).unwrap()
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!deletingTransaction) return
    try {
      await deleteTransaction(deletingTransaction.transaction_uid).unwrap()
    } catch {
      // 刪除失敗維持既有清單顯示，錯誤不額外攔截（→ accounts/page.tsx 同慣例）
    }
    setDeletingTransaction(null)
  }

  // 個別交易的 TransactionResponse 未帶固定收支關聯資訊（後端該欄位屬 recurring_rules 獨立資源，
  // →design-spec [A13]），編輯既有交易時「固定收支」一律預帶未勾選狀態。
  const editInitialValues: TransactionFormInitialValues | undefined = editingTransaction
    ? {
        transaction_type: editingTransaction.transaction_type,
        transaction_date: editingTransaction.transaction_date,
        amount: editingTransaction.amount,
        category_uid: editingTransaction.category_uid,
        description: editingTransaction.description,
        account_uid: editingTransaction.account_uid,
        payment_method: editingTransaction.payment_method,
        recurring: null,
      }
    : undefined

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary md:text-xl">交易清單</h2>
        <button
          type="button"
          onClick={() => setIsMobileFilterOpen(true)}
          className="min-h-11 rounded-md border border-border px-4 text-text-secondary md:hidden"
        >
          篩選
        </button>
      </div>

      <div className="hidden flex-wrap gap-4 md:flex">
        <FilterFields
          value={filters}
          categories={categories ?? []}
          accounts={accounts ?? []}
          onChange={setFilters}
        />
      </div>

      <Dialog open={isMobileFilterOpen} onOpenChange={setIsMobileFilterOpen} title="篩選">
        <div className="flex flex-col gap-4">
          <FilterFields
            value={filters}
            categories={categories ?? []}
            accounts={accounts ?? []}
            onChange={setFilters}
          />
        </div>
      </Dialog>

      {isLoading && <p className="text-text-secondary">載入中…</p>}
      {listError && (
        <p role="alert" className="text-sm text-danger-700">
          {getErrorMessage(listError)}
        </p>
      )}
      {!isLoading && !listError && items.length === 0 && (
        <p className="text-text-secondary">沒有符合條件的交易</p>
      )}

      {!isLoading && !listError && items.length > 0 && (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="p-2 font-medium">日期</th>
                  <th className="p-2 font-medium">分類</th>
                  <th className="p-2 font-medium">明細</th>
                  <th className="p-2 font-medium">金額</th>
                  <th className="p-2 font-medium">收支類型</th>
                  <th className="p-2 font-medium">帳戶</th>
                  <th className="p-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((transaction) => (
                  <TransactionTableRow
                    key={transaction.transaction_uid}
                    transaction={transaction}
                    categoryName={categoryNameByUid.get(transaction.category_uid) ?? ''}
                    accountName={accountNameByUid.get(transaction.account_uid) ?? ''}
                    onEdit={setEditingTransaction}
                    onDelete={setDeletingTransaction}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {items.map((transaction) => (
              <TransactionCard
                key={transaction.transaction_uid}
                transaction={transaction}
                categoryName={categoryNameByUid.get(transaction.category_uid) ?? ''}
                accountName={accountNameByUid.get(transaction.account_uid) ?? ''}
                onEdit={setEditingTransaction}
                onDelete={setDeletingTransaction}
              />
            ))}
          </div>
        </>
      )}

      <TransactionFormDialog
        open={editingTransaction !== null}
        onOpenChange={(open) => {
          if (!open) setEditingTransaction(null)
        }}
        mode="edit"
        initialValues={editInitialValues}
        onSubmit={handleEditSubmit}
      />

      <ConfirmDialog
        open={deletingTransaction !== null}
        title={`刪除「${deletingTransaction?.description || '這筆交易'}」？`}
        confirmLabel={isDeleting ? '刪除中…' : '確認'}
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingTransaction(null)}
      />
    </section>
  )
}
