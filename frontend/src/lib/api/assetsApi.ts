import { baseApi } from './baseApi'
import { unwrapData, type ApiResponse } from './types'

// FE-066：型別本應由 openapi-typescript 對 backend /api/openapi.json codegen 產生，但本 repo
// 尚未接上該 pipeline（見 budgetsApi.ts / transactionsApi.ts 頂部同一備註）。這裡手寫對齊
// backend/app/schemas/financial_asset.py / liability.py / net_worth.py 的最小型別；codegen
// 接上後改成 `components['schemas']['FinancialAssetResponse']` 等型別。
export type AssetType = 'stock' | 'metal'

// backend/app/utils/unit_conversion.py：股票只收「張」「股」，貴金屬只收「兩」「錢」。
export type StockUnit = '張' | '股'
export type MetalUnit = '兩' | '錢'

export interface FinancialAssetResponse {
  financial_asset_uid: string
  asset_type: AssetType
  name: string
  // Decimal 由後端 field_serializer 轉字串（DB-038），前端不解析成 number 以免精度誤差
  input_quantity: string
  input_unit: string
  base_quantity: string
  // 本金（原始購入成本），nullable：舊資產列可能沒有
  principal_amount: string | null
}

export interface FinancialAssetListResponse {
  items: FinancialAssetResponse[]
  total: number
}

export interface FinancialAssetCreateRequest {
  asset_type: AssetType
  name: string
  input_quantity: string
  input_unit: StockUnit | MetalUnit
  principal_amount: string
}

export interface LiabilityResponse {
  liability_uid: string
  name: string
  amount: string
  interest_rate: string | null
}

export interface LiabilityListResponse {
  items: LiabilityResponse[]
  total: number
}

export interface LiabilityCreateRequest {
  name: string
  amount: string
  interest_rate: string | null
}

export interface NetWorthResponse {
  total_assets: string
  total_liabilities: string
  net_worth: string
}

const assetsApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['FinancialAsset', 'Liability', 'NetWorth'] })
  .injectEndpoints({
    endpoints: (build) => ({
      listFinancialAssets: build.query<FinancialAssetListResponse, void>({
        query: () => 'financial-assets',
        transformResponse: (res: ApiResponse<FinancialAssetListResponse>) => unwrapData(res),
        providesTags: (result) => [
          ...(result?.items ?? []).map((a) => ({
            type: 'FinancialAsset' as const,
            id: a.financial_asset_uid,
          })),
          { type: 'FinancialAsset' as const, id: 'LIST' },
        ],
      }),
      createFinancialAsset: build.mutation<FinancialAssetResponse, FinancialAssetCreateRequest>({
        query: (body) => ({ url: 'financial-assets', method: 'POST', body }),
        transformResponse: (res: ApiResponse<FinancialAssetResponse>) => unwrapData(res),
        invalidatesTags: [
          { type: 'FinancialAsset', id: 'LIST' },
          { type: 'NetWorth', id: 'SUMMARY' },
        ],
      }),
      listLiabilities: build.query<LiabilityListResponse, void>({
        query: () => 'liabilities',
        transformResponse: (res: ApiResponse<LiabilityListResponse>) => unwrapData(res),
        providesTags: (result) => [
          ...(result?.items ?? []).map((l) => ({
            type: 'Liability' as const,
            id: l.liability_uid,
          })),
          { type: 'Liability' as const, id: 'LIST' },
        ],
      }),
      createLiability: build.mutation<LiabilityResponse, LiabilityCreateRequest>({
        query: (body) => ({ url: 'liabilities', method: 'POST', body }),
        transformResponse: (res: ApiResponse<LiabilityResponse>) => unwrapData(res),
        invalidatesTags: [
          { type: 'Liability', id: 'LIST' },
          { type: 'NetWorth', id: 'SUMMARY' },
        ],
      }),
      // task-016 彙總 API：可回 424（上游報價來源暫時不可用，非 5xx），呼叫端需分開處理
      // 一般錯誤與 424，不可讓整頁崩潰（見 dashboard/page.tsx）。
      getNetWorth: build.query<NetWorthResponse, void>({
        query: () => 'net-worth',
        transformResponse: (res: ApiResponse<NetWorthResponse>) => unwrapData(res),
        providesTags: [{ type: 'NetWorth', id: 'SUMMARY' }],
      }),
    }),
    overrideExisting: false,
  })

export const {
  useListFinancialAssetsQuery,
  useCreateFinancialAssetMutation,
  useListLiabilitiesQuery,
  useCreateLiabilityMutation,
  useGetNetWorthQuery,
} = assetsApi
