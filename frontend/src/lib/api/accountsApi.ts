import { baseApi } from './baseApi'
import { unwrapData, type ApiResponse } from './types'

// FE-066：型別本應由 openapi-typescript 對 backend /api/openapi.json codegen 產生，但本 repo
// 尚未接上該 pipeline（見 categoriesApi.ts / dashboardApi.ts / budgetsApi.ts 頂部同一備註）。
// 這裡手寫對齊 backend/app/schemas/account.py 的最小型別；codegen 接上後改成
// `components['schemas']['AccountResponse']` 等型別。
//
// design-spec §12.4（→ A8）：color/icon 為 task-005 新增欄位，取代前端依名稱雜湊配色的舊方案。
export interface AccountResponse {
  account_uid: string
  name: string
  // Decimal 由後端 field_serializer 轉字串（DB-038），前端不解析成 number 以免精度誤差
  balance: string
  currency: string
  // hex 色碼，含 #（後端驗證 ^#[0-9A-Fa-f]{6}$）
  color: string
  // 圖示 key，合法清單由 <IconPicker> 維護（→ A9），後端只驗證非空字串
  icon: string
}

export interface AccountListResponse {
  items: AccountResponse[]
  total: number
}

export interface AccountCreateRequest {
  name: string
  balance: string
  color: string
  icon: string
}

// 改名/改色/改圖示不需通過重建帳戶流程（design-spec §9.6），四欄位皆各自 optional，比照後端
// AccountUpdateRequest 的 partial-update 寫法（→ categoriesApi.ts CategoryUpdateRequest 同慣例）。
export interface AccountUpdateRequest {
  accountUid: string
  name?: string
  balance?: string
  color?: string
  icon?: string
}

const accountsApi = baseApi
  // 'Account' tag 已由 transactionsApi.ts（下拉選單唯讀 query）註冊；本檔的 CRUD mutation
  // invalidate 同一 tag，讓交易表單的帳戶下拉選單在此頁新增/改名/刪除後自動失效重抓。
  .enhanceEndpoints({ addTagTypes: ['Account'] })
  .injectEndpoints({
    endpoints: (build) => ({
      listAccounts: build.query<AccountListResponse, void>({
        query: () => 'accounts',
        transformResponse: (res: ApiResponse<AccountListResponse>) => unwrapData(res),
        providesTags: (result) => [
          ...(result?.items ?? []).map((a) => ({ type: 'Account' as const, id: a.account_uid })),
          { type: 'Account' as const, id: 'LIST' },
        ],
      }),
      createAccount: build.mutation<AccountResponse, AccountCreateRequest>({
        query: (body) => ({ url: 'accounts', method: 'POST', body }),
        transformResponse: (res: ApiResponse<AccountResponse>) => unwrapData(res),
        invalidatesTags: [{ type: 'Account', id: 'LIST' }],
      }),
      updateAccount: build.mutation<AccountResponse, AccountUpdateRequest>({
        query: ({ accountUid, ...body }) => ({
          url: `accounts/${accountUid}`,
          method: 'PATCH',
          body,
        }),
        transformResponse: (res: ApiResponse<AccountResponse>) => unwrapData(res),
        invalidatesTags: (_result, _error, { accountUid }) => [
          { type: 'Account' as const, id: accountUid },
          { type: 'Account' as const, id: 'LIST' },
        ],
      }),
      // 刪除成功回應為 ApiResponse[None]（data 恆為 null），與「data 為 null 視為錯誤」的
      // unwrapData 語意衝突（→ categoriesApi.ts deleteCategory 同寫法），不經 unwrapData。
      deleteAccount: build.mutation<void, string>({
        query: (accountUid) => ({ url: `accounts/${accountUid}`, method: 'DELETE' }),
        transformResponse: () => undefined,
        invalidatesTags: (_result, _error, accountUid) => [
          { type: 'Account' as const, id: accountUid },
          { type: 'Account' as const, id: 'LIST' },
        ],
      }),
    }),
    overrideExisting: false,
  })

export const {
  useListAccountsQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useDeleteAccountMutation,
} = accountsApi
