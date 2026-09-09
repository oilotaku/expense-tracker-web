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
  // backend FinancialAssetCreateRequest.principal_amount: Decimal = Field(gt=0, ...)，必填
  principal_amount: string
}

// asset_type 不可修改（後端不接受），故不含在 partial-update 欄位內（→ accountsApi.ts
// AccountUpdateRequest 同一 partial-update 慣例）。
export interface FinancialAssetUpdateRequest {
  financial_asset_uid: string
  name?: string
  input_quantity?: string
  input_unit?: StockUnit | MetalUnit
  principal_amount?: string
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

export interface LiabilityUpdateRequest {
  liability_uid: string
  name?: string
  amount?: string
  interest_rate?: string | null
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
      updateFinancialAsset: build.mutation<FinancialAssetResponse, FinancialAssetUpdateRequest>({
        query: ({ financial_asset_uid, ...body }) => ({
          url: `financial-assets/${financial_asset_uid}`,
          method: 'PATCH',
          body,
        }),
        transformResponse: (res: ApiResponse<FinancialAssetResponse>) => unwrapData(res),
        // 數量／本金變動會影響淨資產彙總，同 createFinancialAsset 一併 invalidate NetWorth SUMMARY
        invalidatesTags: (_result, _error, { financial_asset_uid }) => [
          { type: 'FinancialAsset' as const, id: financial_asset_uid },
          { type: 'FinancialAsset' as const, id: 'LIST' },
          { type: 'NetWorth' as const, id: 'SUMMARY' },
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
      updateLiability: build.mutation<LiabilityResponse, LiabilityUpdateRequest>({
        query: ({ liability_uid, ...body }) => ({
          url: `liabilities/${liability_uid}`,
          method: 'PATCH',
          body,
        }),
        transformResponse: (res: ApiResponse<LiabilityResponse>) => unwrapData(res),
        // 還款會改動 amount，影響淨資產彙總，同 createLiability 一併 invalidate NetWorth SUMMARY
        invalidatesTags: (_result, _error, { liability_uid }) => [
          { type: 'Liability' as const, id: liability_uid },
          { type: 'Liability' as const, id: 'LIST' },
          { type: 'NetWorth' as const, id: 'SUMMARY' },
        ],
      }),
      // 刪除成功回應為 ApiResponse[None]（data 恆為 null），與「data 為 null 視為錯誤」的
      // unwrapData 語意衝突（→ accountsApi.ts deleteAccount 同寫法），不經 unwrapData。
      deleteLiability: build.mutation<void, string>({
        query: (liability_uid) => ({ url: `liabilities/${liability_uid}`, method: 'DELETE' }),
        transformResponse: () => undefined,
        invalidatesTags: (_result, _error, liability_uid) => [
          { type: 'Liability' as const, id: liability_uid },
          { type: 'Liability' as const, id: 'LIST' },
          { type: 'NetWorth' as const, id: 'SUMMARY' },
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
  useUpdateFinancialAssetMutation,
  useListLiabilitiesQuery,
  useCreateLiabilityMutation,
  useUpdateLiabilityMutation,
  useDeleteLiabilityMutation,
  useGetNetWorthQuery,
} = assetsApi
