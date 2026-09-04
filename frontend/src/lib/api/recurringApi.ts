import { baseApi } from './baseApi'
import { unwrapData, type ApiResponse } from './types'
import type { TransactionType } from './transactionsApi'

// FE-066：型別本應由 openapi-typescript 對 backend /api/openapi.json codegen 產生，但本 repo
// 尚未接上該 pipeline（見 transactionsApi.ts / authApi.ts 頂部同一備註）。這裡手寫對齊
// backend/app/schemas/recurring_rule.py 的最小型別；codegen 接上後改成
// `components['schemas']['RecurringRuleResponse']` 等型別。
export interface RecurringRuleResponse {
  recurring_rule_uid: string
  account_uid: string
  category_uid: string
  description: string
  // Decimal 由後端 field_serializer 轉字串（DB-038），前端不解析成 number 以免精度誤差
  amount: string
  transaction_type: TransactionType
  payment_method: string
  // 每月第幾天，1–31（backend/app/schemas/recurring_rule.py：Field(ge=1, le=31)）
  day_of_month: number
  last_generated_year_month: string | null
}

export interface RecurringRuleCreateRequest {
  account_uid: string
  category_uid: string
  description: string
  amount: string
  transaction_type: TransactionType
  payment_method: string
  day_of_month: number
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
    }),
    overrideExisting: false,
  })

export const { useListRecurringRulesQuery, useCreateRecurringRuleMutation } = recurringApi
