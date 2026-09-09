import { baseApi } from './baseApi'
import { unwrapData, type ApiResponse } from './types'

// FE-066：型別本應由 openapi-typescript 對 backend /api/openapi.json codegen 產生，但本 repo
// 尚未接上該 pipeline（見 authApi.ts 頂部同一備註）。這裡手寫對齊
// backend/app/schemas/transaction.py 的最小型別；codegen 接上後改成
// `components['schemas']['TransactionResponse']` 等型別。
export type TransactionType = 'income' | 'expense' | 'transfer'

/** 轉帳（雙分錄）方向：`out` 為轉出的那一列、`in` 為轉入的那一列（→ TransferDirection）。 */
export type TransferDirection = 'out' | 'in'

// 轉帳一律走 TransferCreateRequest / POST /transactions/transfer（沒有分類、需要兩個帳戶），
// 舊的建立/更新交易一般收支不接受 'transfer'，型別上直接收窄避免誤送（同後端 Literal 收窄）。
export type NonTransferType = Exclude<TransactionType, 'transfer'>

export interface TagResponse {
  tag_uid: string
  name: string
}

export interface TransactionResponse {
  transaction_uid: string
  account_uid: string
  // 轉帳列沒有分類（→ ck_transactions_transfer_shape），一般收支交易仍恆有值。
  category_uid: string | null
  // ISO 8601 帶 offset（FE-039），後端 ApiSchema 一律序列化為 API_TZ（+08:00）
  transaction_date: string
  description: string
  // Decimal 由後端 field_serializer 轉字串（DB-038），前端不解析成 number 以免精度誤差
  amount: string
  transaction_type: TransactionType
  payment_method: string
  tags: TagResponse[]
  // 以下三個欄位只有轉帳列（transaction_type === 'transfer'）才有值，一般收支交易恆為 null。
  transfer_group_uid: string | null
  transfer_direction: TransferDirection | null
  // 「這一列」的對方帳戶 uid：OUT 列填目標帳戶、IN 列填來源帳戶，讓 UI 顯示「A → B」不用
  // 額外打 API（→ TransactionList.tsx accountNameByUid 查表）。
  transfer_counterpart_account_uid: string | null
}

export interface TransactionCreateRequest {
  account_uid: string
  category_uid: string
  transaction_date: string
  description: string
  amount: string
  transaction_type: NonTransferType
  payment_method: string
  // 標籤以名稱字串傳入，後端 get-or-create（不是 tag_uid，見 backend/app/schemas/transaction.py）
  tags: string[]
}

export interface TransferCreateRequest {
  from_account_uid: string
  to_account_uid: string
  transaction_date: string
  description: string
  amount: string
  payment_method: string
}

export interface TransferUpdateRequest {
  transferGroupUid: string
  from_account_uid?: string
  to_account_uid?: string
  transaction_date?: string
  description?: string
  amount?: string
  payment_method?: string
}

export interface TransferResponse {
  outbound: TransactionResponse
  inbound: TransactionResponse
}

export interface TransactionListFilter {
  category_uid?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}

export interface TransactionListResponse {
  items: TransactionResponse[]
  total: number
}

// 帳戶 / 分類下拉選單所需的最小讀取型別。task-002 / task-003 已提供完整後端 CRUD
// （backend/app/api/v1/accounts.py、categories.py），但 tasks-v1.0.0.md 目前沒有獨立的
// 「帳戶 / 分類前端」task 產出 lib/api/accountsApi.ts / categoriesApi.ts；task-006 的
// affected_files 也未列這兩個檔。為了不擴大本 task scope（禁自行新增 affected_files 外的檔案），
// 這裡只在 transactionsApi.ts 內加兩個唯讀 query 供交易表單 / 清單的下拉選單與篩選使用，
// 不含其餘帳戶 / 分類 CRUD mutation；未來補上對應 task 時應搬到各自的 lib/api/<feature>.ts。
export interface AccountOption {
  account_uid: string
  name: string
  balance: string
  currency: string
}

export interface CategoryOption {
  category_uid: string
  name: string
}

interface ListResponse<T> {
  items: T[]
  total: number
}

const transactionsApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['Transaction', 'Account', 'Category', 'DashboardSummary'] })
  .injectEndpoints({
    endpoints: (build) => ({
      listTransactions: build.query<TransactionListResponse, TransactionListFilter | void>({
        // fetchBaseQuery 的 params 內部用 `new URLSearchParams(obj)`，obj 內 undefined 值會被
        // String() 成 "undefined" 字面字串（不會自動略過該 key），故送出前先過濾掉 undefined。
        query: (filters) => ({
          url: 'transactions',
          params: filters
            ? Object.fromEntries(
                Object.entries(filters).filter(([, value]) => value !== undefined),
              )
            : undefined,
        }),
        transformResponse: (res: ApiResponse<TransactionListResponse>) => unwrapData(res),
        providesTags: (result) => [
          ...(result?.items ?? []).map((t) => ({
            type: 'Transaction' as const,
            id: t.transaction_uid,
          })),
          { type: 'Transaction' as const, id: 'LIST' },
        ],
      }),
      createTransaction: build.mutation<TransactionResponse, TransactionCreateRequest>({
        query: (body) => ({ url: 'transactions', method: 'POST', body }),
        transformResponse: (res: ApiResponse<TransactionResponse>) => unwrapData(res),
        invalidatesTags: [
          { type: 'Transaction', id: 'LIST' },
          { type: 'Account', id: 'LIST' },
          { type: 'DashboardSummary', id: 'SUMMARY' },
        ],
      }),
      createTransfer: build.mutation<TransferResponse, TransferCreateRequest>({
        query: (body) => ({ url: 'transactions/transfer', method: 'POST', body }),
        transformResponse: (res: ApiResponse<TransferResponse>) => unwrapData(res),
        // Account LIST 一個 tag 就涵蓋兩個帳戶（RTK Query 的 LIST tag 語意本就是「整份清單」，
        // 不需要分別指定 from/to 兩個帳戶 uid）。
        invalidatesTags: [
          { type: 'Transaction', id: 'LIST' },
          { type: 'Account', id: 'LIST' },
          { type: 'DashboardSummary', id: 'SUMMARY' },
        ],
      }),
      updateTransfer: build.mutation<TransferResponse, TransferUpdateRequest>({
        query: ({ transferGroupUid, ...body }) => ({
          url: `transactions/transfer/${transferGroupUid}`,
          method: 'PATCH',
          body,
        }),
        transformResponse: (res: ApiResponse<TransferResponse>) => unwrapData(res),
        invalidatesTags: (_result, _error, { transferGroupUid }) => [
          { type: 'Transaction' as const, id: transferGroupUid },
          { type: 'Transaction' as const, id: 'LIST' },
          { type: 'Account' as const, id: 'LIST' },
          { type: 'DashboardSummary' as const, id: 'SUMMARY' },
        ],
      }),
      deleteTransfer: build.mutation<void, string>({
        query: (transferGroupUid) => ({
          url: `transactions/transfer/${transferGroupUid}`,
          method: 'DELETE',
        }),
        // 刪除成功回應為 ApiResponse[None]（data 恆為 null），同 deleteTransaction 既有寫法
        // 不經 unwrapData（避免「data 為 null 視為錯誤」的語意衝突）。
        transformResponse: () => undefined,
        invalidatesTags: (_result, _error, transferGroupUid) => [
          { type: 'Transaction' as const, id: transferGroupUid },
          { type: 'Transaction' as const, id: 'LIST' },
          { type: 'Account' as const, id: 'LIST' },
          { type: 'DashboardSummary' as const, id: 'SUMMARY' },
        ],
      }),
      listAccountOptions: build.query<AccountOption[], void>({
        query: () => 'accounts',
        transformResponse: (res: ApiResponse<ListResponse<AccountOption>>) =>
          unwrapData(res).items,
        providesTags: [{ type: 'Account', id: 'LIST' }],
      }),
      listCategoryOptions: build.query<CategoryOption[], void>({
        query: () => 'categories',
        transformResponse: (res: ApiResponse<ListResponse<CategoryOption>>) =>
          unwrapData(res).items,
        providesTags: [{ type: 'Category', id: 'LIST' }],
      }),
    }),
    overrideExisting: false,
  })

export const {
  useListTransactionsQuery,
  useCreateTransactionMutation,
  useCreateTransferMutation,
  useUpdateTransferMutation,
  useDeleteTransferMutation,
  useListAccountOptionsQuery,
  useListCategoryOptionsQuery,
} = transactionsApi
