import { baseApi } from './baseApi'
import { unwrapData, type ApiResponse } from './types'

// FE-066：型別本應由 openapi-typescript 對 backend /api/openapi.json codegen 產生，但本 repo
// 尚未接上該 pipeline（見 transactionsApi.ts 頂部同一備註）。這裡手寫對齊
// backend/app/schemas/budget.py 的最小型別；codegen 接上後改成
// `components['schemas']['BudgetResponse']` 等型別。
export type BudgetPeriodType = 'monthly' | 'daily'

export interface BudgetResponse {
  budget_uid: string
  category_uid: string
  period_type: BudgetPeriodType
  // Decimal 由後端 field_serializer 轉字串（DB-038），前端不解析成 number 以免精度誤差
  limit_amount: string
}

export interface BudgetCreateRequest {
  category_uid: string
  period_type: BudgetPeriodType
  limit_amount: string
}

export interface BudgetUpdateRequest {
  budgetUid: string
  limit_amount: string
}

export interface BudgetListResponse {
  items: BudgetResponse[]
  total: number
}

export interface BudgetSummaryResponse {
  budget_uid: string
  category_uid: string
  period_type: BudgetPeriodType
  limit_amount: string
  spent_amount: string
  remaining_amount: string
  is_over_budget: boolean
}

const budgetsApi = baseApi.enhanceEndpoints({ addTagTypes: ['Budget'] }).injectEndpoints({
  endpoints: (build) => ({
    listBudgets: build.query<BudgetListResponse, void>({
      query: () => 'budgets',
      transformResponse: (res: ApiResponse<BudgetListResponse>) => unwrapData(res),
      providesTags: (result) => [
        ...(result?.items ?? []).map((b) => ({ type: 'Budget' as const, id: b.budget_uid })),
        { type: 'Budget' as const, id: 'LIST' },
      ],
    }),
    createBudget: build.mutation<BudgetResponse, BudgetCreateRequest>({
      query: (body) => ({ url: 'budgets', method: 'POST', body }),
      transformResponse: (res: ApiResponse<BudgetResponse>) => unwrapData(res),
      invalidatesTags: [{ type: 'Budget', id: 'LIST' }],
    }),
    // 已花費彙總（同分類、同期間支出加總與上限比較，→ backend BudgetService.get_summary）；
    // 依 budget_uid 個別查詢，供清單內每筆預算各自顯示進度。
    getBudgetSummary: build.query<BudgetSummaryResponse, string>({
      query: (budgetUid) => `budgets/${budgetUid}/summary`,
      transformResponse: (res: ApiResponse<BudgetSummaryResponse>) => unwrapData(res),
      providesTags: (_result, _error, budgetUid) => [{ type: 'Budget' as const, id: budgetUid }],
    }),
    // 改上限金額（PATCH /budgets/{uid}）。後端早已支援，只是前端從未串接（task-039）；
    // invalidate 該 budget 的 LIST 與 summary tag，讓清單與進度條一起重新抓最新上限。
    updateBudget: build.mutation<BudgetResponse, BudgetUpdateRequest>({
      query: ({ budgetUid, ...body }) => ({
        url: `budgets/${budgetUid}`,
        method: 'PATCH',
        body,
      }),
      transformResponse: (res: ApiResponse<BudgetResponse>) => unwrapData(res),
      invalidatesTags: (_result, _error, { budgetUid }) => [
        { type: 'Budget', id: budgetUid },
        { type: 'Budget', id: 'LIST' },
      ],
    }),
    // 刪除預算（DELETE /budgets/{uid}，軟刪）。同上，後端早已支援。
    deleteBudget: build.mutation<void, string>({
      query: (budgetUid) => ({ url: `budgets/${budgetUid}`, method: 'DELETE' }),
      transformResponse: () => undefined,
      invalidatesTags: [{ type: 'Budget', id: 'LIST' }],
    }),
  }),
  overrideExisting: false,
})

export const {
  useListBudgetsQuery,
  useCreateBudgetMutation,
  useGetBudgetSummaryQuery,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
} = budgetsApi
