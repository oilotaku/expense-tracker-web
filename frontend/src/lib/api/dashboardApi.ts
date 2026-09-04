import { baseApi } from './baseApi'
import { unwrapData, type ApiResponse } from './types'

// FE-066：型別本應由 openapi-typescript 對 backend /api/openapi.json codegen 產生，但本 repo
// 尚未接上該 pipeline（見 assetsApi.ts / budgetsApi.ts 頂部同一備註）。這裡手寫對齊
// backend/app/schemas/dashboard.py 的最小型別；codegen 接上後改成
// `components['schemas']['DashboardSummaryResponse']` 等型別。
export type DashboardPeriod = 'month' | 'year' | 'custom'

export interface DashboardSummaryRequest {
  period: DashboardPeriod
  // 呼叫端已將使用者選擇的當地日期範圍轉換成 Settings.API_TZ 對應的 UTC 邊界（→ A14 / CORE-041），
  // 這裡沿用既有 TransactionListFilter.date_from/date_to 的 ISO 8601 字串慣例
  dateFrom: string
  dateTo: string
}

export interface DashboardSummaryResponse {
  period: string
  date_from: string
  date_to: string
  // Decimal 由後端 field_serializer 轉字串（DB-038），前端不解析成 number 以免精度誤差
  income: string
  expense: string
  balance: string
  // period !== 'month' 時一律 null（→ A7，對齊 Budget.period_type=monthly 的限制）；
  // period === 'month' 且使用者未設定任何月度預算時為 "0.00"（非 null，區分「不適用」與「有查、目前是 0」）
  budget_remaining: string | null
}

const dashboardApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['DashboardSummary'] })
  .injectEndpoints({
    endpoints: (build) => ({
      getDashboardSummary: build.query<DashboardSummaryResponse, DashboardSummaryRequest>({
        query: ({ period, dateFrom, dateTo }) => ({
          url: 'dashboard/summary',
          params: { period, date_from: dateFrom, date_to: dateTo },
        }),
        transformResponse: (res: ApiResponse<DashboardSummaryResponse>) => unwrapData(res),
        providesTags: [{ type: 'DashboardSummary' as const, id: 'SUMMARY' }],
      }),
    }),
    overrideExisting: false,
  })

export const { useGetDashboardSummaryQuery } = dashboardApi
