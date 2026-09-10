import { baseApi } from './baseApi'
import { unwrapData, type ApiResponse } from './types'
import type { NonTransferType } from './transactionsApi'

// FE-066：型別本應由 openapi-typescript 對 backend /api/openapi.json codegen 產生，但本 repo
// 尚未接上該 pipeline（見 transactionsApi.ts / authApi.ts 頂部同一備註）。這裡手寫對齊
// backend/app/schemas/recurring_rule.py 的最小型別；codegen 接上後改成
// `components['schemas']['RecurringRuleResponse']` 等型別。
//
// task-003（後端）已將週期描述由單一 `day_of_month` 改為 `interval_unit` +
// `interval_count` + `anchor_date`（design-spec §12.3）；`day_of_month` 欄位雖在 DB
// 保留（`→ DB-033`，nullable），但 `RecurringRuleResponse` 已不再回傳該欄位，故此處移除。
export type RecurringIntervalUnit = 'week' | 'month' | 'year'

export interface RecurringRuleResponse {
  recurring_rule_uid: string
  account_uid: string
  category_uid: string
  description: string
  // Decimal 由後端 field_serializer 轉字串（DB-038），前端不解析成 number 以免精度誤差
  amount: string
  transaction_type: NonTransferType
  payment_method: string
  // 週期單位：週/月/年（backend/app/schemas/recurring_rule.py）
  interval_unit: RecurringIntervalUnit
  // 每幾個 interval_unit 觸發一次，1–99（Field(ge=1, le=99)）
  interval_count: number
  // 錨點日期（YYYY-MM-DD），下一次執行日由此起算（design-spec §7.2）
  anchor_date: string
  last_generated_year_month: string | null
  // 連結負債定期還款（null = 一般收支週期性交易）；→ backend RecurringService
  liability_uid: string | null
}

export interface RecurringRuleCreateRequest {
  account_uid: string
  category_uid: string
  description: string
  amount: string
  transaction_type: NonTransferType
  payment_method: string
  interval_unit: RecurringIntervalUnit
  interval_count: number
  anchor_date: string
  liability_uid?: string
}

export interface RecurringRuleListResponse {
  items: RecurringRuleResponse[]
  total: number
}

const recurringApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['RecurringRule'] })
  .injectEndpoints({
    endpoints: (build) => ({
      listRecurringRules: build.query<RecurringRuleListResponse, void>({
        query: () => 'recurring-rules',
        transformResponse: (res: ApiResponse<RecurringRuleListResponse>) => unwrapData(res),
        providesTags: (result) => [
          ...(result?.items ?? []).map((rule) => ({
            type: 'RecurringRule' as const,
            id: rule.recurring_rule_uid,
          })),
          { type: 'RecurringRule' as const, id: 'LIST' },
        ],
      }),
      createRecurringRule: build.mutation<RecurringRuleResponse, RecurringRuleCreateRequest>({
        query: (body) => ({ url: 'recurring-rules', method: 'POST', body }),
        transformResponse: (res: ApiResponse<RecurringRuleResponse>) => unwrapData(res),
        invalidatesTags: [{ type: 'RecurringRule', id: 'LIST' }],
      }),
      deleteRecurringRule: build.mutation<void, string>({
        query: (recurring_rule_uid) => ({
          url: `recurring-rules/${recurring_rule_uid}`,
          method: 'DELETE',
        }),
        invalidatesTags: (_result, _error, recurring_rule_uid) => [
          { type: 'RecurringRule' as const, id: recurring_rule_uid },
          { type: 'RecurringRule' as const, id: 'LIST' },
        ],
      }),
    }),
    overrideExisting: false,
  })

export const {
  useListRecurringRulesQuery,
  useCreateRecurringRuleMutation,
  useDeleteRecurringRuleMutation,
} = recurringApi
