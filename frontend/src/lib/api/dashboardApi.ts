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

// 外幣帳戶功能：分類圖表/趨勢線圖是前端就地把 useListTransactionsQuery 的原始交易加總（不像
// 彙總卡片走後端 SQL GROUP BY 換算），要正確加總不同幣別的交易金額需要這份即時匯率。
export interface CurrencyRatesResponse {
  // key 為幣別代碼（對齊 accountsApi.ts SupportedCurrency），value 為對 TWD 的匯率字串
  rates: Record<string, string>
}

export interface DashboardDateRangeRequest {
  dateFrom: string
  dateTo: string
}

export interface CategoryBreakdownItem {
  category_uid: string
  // Decimal 由後端 field_serializer 轉字串（DB-038），已在後端換算成 TWD 加總完畢
  amount: string
}

export interface CategoryBreakdownResponse {
  items: CategoryBreakdownItem[]
}

export interface DashboardTrendPoint {
  // 本地日曆日（Settings.API_TZ，非 UTC），"YYYY-MM-DD"
  date: string
  income: string
  expense: string
}

export interface DashboardTrendResponse {
  items: DashboardTrendPoint[]
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
      // 匯率變動緩慢（後端快取 12 小時），這裡不特別設 providesTags/invalidate，走 RTK Query
      // 預設快取即可。
      getExchangeRates: build.query<CurrencyRatesResponse, void>({
        query: () => 'dashboard/exchange-rates',
        transformResponse: (res: ApiResponse<CurrencyRatesResponse>) => unwrapData(res),
      }),
      // 取代舊版前端吃 useListTransactionsQuery(limit=100) 自算分類/趨勢的做法（→
      // dashboard/page.tsx 既有註解，交易數超過 100 筆時資料不完整）；跟 getDashboardSummary
      // 共用 DashboardSummary/SUMMARY tag，交易異動時一併失效重新查詢。
      getCategoryBreakdown: build.query<CategoryBreakdownResponse, DashboardDateRangeRequest>({
        query: ({ dateFrom, dateTo }) => ({
          url: 'dashboard/category-breakdown',
          params: { date_from: dateFrom, date_to: dateTo },
        }),
        transformResponse: (res: ApiResponse<CategoryBreakdownResponse>) => unwrapData(res),
        providesTags: [{ type: 'DashboardSummary' as const, id: 'SUMMARY' }],
      }),
      getDashboardTrend: build.query<DashboardTrendResponse, DashboardDateRangeRequest>({
        query: ({ dateFrom, dateTo }) => ({
          url: 'dashboard/trend',
          params: { date_from: dateFrom, date_to: dateTo },
        }),
        transformResponse: (res: ApiResponse<DashboardTrendResponse>) => unwrapData(res),
        providesTags: [{ type: 'DashboardSummary' as const, id: 'SUMMARY' }],
      }),
    }),
    overrideExisting: false,
  })

export const {
  useGetDashboardSummaryQuery,
  useGetExchangeRatesQuery,
  useGetCategoryBreakdownQuery,
  useGetDashboardTrendQuery,
} = dashboardApi
