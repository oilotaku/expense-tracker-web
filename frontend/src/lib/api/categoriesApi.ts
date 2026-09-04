import { baseApi } from './baseApi'
import { unwrapData, type ApiResponse } from './types'

// FE-066：型別本應由 openapi-typescript 對 backend /api/openapi.json codegen 產生，但本 repo
// 尚未接上該 pipeline（見 budgetsApi.ts / dashboardApi.ts 頂部同一備註）。這裡手寫對齊
// backend/app/schemas/category.py 的最小型別；codegen 接上後改成
// `components['schemas']['CategoryResponse']` 等型別。
//
// design-spec §12.4（→ A8）：color/icon 為 task-004 新增欄位，取代前端依名稱雜湊配色的舊方案。
export interface CategoryResponse {
  category_uid: string
  name: string
  // hex 色碼，含 #（後端驗證 ^#[0-9A-Fa-f]{6}$）
  color: string
  // 圖示 key，合法清單由 <IconPicker> 維護（→ A9），後端只驗證非空字串
  icon: string
}

export interface CategoryListResponse {
  items: CategoryResponse[]
  total: number
}

export interface CategoryCreateRequest {
  name: string
  color: string
  icon: string
}

// 改色/改圖示不需通過重新命名流程（design-spec §8），三欄位皆各自 optional，比照後端
// CategoryUpdateRequest 的 partial-update 寫法。
export interface CategoryUpdateRequest {
  categoryUid: string
  name?: string
  color?: string
  icon?: string
}

const categoriesApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['Category'] })
  .injectEndpoints({
    endpoints: (build) => ({
      // 分類管理頁（design-spec §8）為單一扁平清單、無分頁 UI，limit 拉到後端上限一次取全部
      // （→ backend/app/api/v1/categories.py `Query(ge=1, le=100)`）。
      listCategories: build.query<CategoryListResponse, void>({
        query: () => ({ url: 'categories', params: { limit: 100 } }),
        transformResponse: (res: ApiResponse<CategoryListResponse>) => unwrapData(res),
        providesTags: (result) => [
          ...(result?.items ?? []).map((c) => ({ type: 'Category' as const, id: c.category_uid })),
          { type: 'Category' as const, id: 'LIST' },
        ],
      }),
      createCategory: build.mutation<CategoryResponse, CategoryCreateRequest>({
        query: (body) => ({ url: 'categories', method: 'POST', body }),
        transformResponse: (res: ApiResponse<CategoryResponse>) => unwrapData(res),
        invalidatesTags: [{ type: 'Category', id: 'LIST' }],
      }),
      updateCategory: build.mutation<CategoryResponse, CategoryUpdateRequest>({
        query: ({ categoryUid, ...body }) => ({
          url: `categories/${categoryUid}`,
          method: 'PATCH',
          body,
        }),
        transformResponse: (res: ApiResponse<CategoryResponse>) => unwrapData(res),
        invalidatesTags: (_result, _error, { categoryUid }) => [
          { type: 'Category' as const, id: categoryUid },
          { type: 'Category' as const, id: 'LIST' },
        ],
      }),
      // 刪除成功回應為 ApiResponse[None]（data 恆為 null），與「data 為 null 視為錯誤」的
      // unwrapData 語意衝突（→ authApi.ts setPin/changePin/deletePin 同寫法），不經 unwrapData。
      deleteCategory: build.mutation<void, string>({
        query: (categoryUid) => ({ url: `categories/${categoryUid}`, method: 'DELETE' }),
        transformResponse: () => undefined,
        invalidatesTags: (_result, _error, categoryUid) => [
          { type: 'Category' as const, id: categoryUid },
          { type: 'Category' as const, id: 'LIST' },
        ],
      }),
    }),
    overrideExisting: false,
  })

export const {
  useListCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
} = categoriesApi
