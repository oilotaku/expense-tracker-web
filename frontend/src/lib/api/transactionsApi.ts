import { baseApi } from './baseApi'
import { unwrapData, type ApiResponse } from './types'

// FE-066：型別本應由 openapi-typescript 對 backend /api/openapi.json codegen 產生，但本 repo
// 尚未接上該 pipeline（見 authApi.ts 頂部同一備註）。這裡手寫對齊
// backend/app/schemas/transaction.py 的最小型別；codegen 接上後改成
// `components['schemas']['TransactionResponse']` 等型別。
export type TransactionType = 'income' | 'expense'

export interface TagResponse {
  tag_uid: string
  name: string
}

export interface TransactionResponse {
  transaction_uid: string
  account_uid: string
  category_uid: string
  // ISO 8601 帶 offset（FE-039），後端 ApiSchema 一律序列化為 API_TZ（+08:00）
  transaction_date: string
  description: string
  // Decimal 由後端 field_serializer 轉字串（DB-038），前端不解析成 number 以免精度誤差
  amount: string
  transaction_type: TransactionType
  payment_method: string
  tags: TagResponse[]
}

export interface TransactionCreateRequest {
  account_uid: string
  category_uid: string
  transaction_date: string
  description: string
  amount: string
  transaction_type: TransactionType
  payment_method: string
  // 標籤以名稱字串傳入，後端 get-or-create（不是 tag_uid，見 backend/app/schemas/transaction.py）
  tags: string[]
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
  useListAccountOptionsQuery,
  useListCategoryOptionsQuery,
} = transactionsApi
