import { baseApi, resolveApiBaseUrl } from './baseApi'
import { unwrapData, type ApiResponse } from './types'

// 手寫對齊 backend/app/schemas/icon.py（同 categoriesApi.ts 頂部 FE-066 備註：codegen 尚未接上）。
// 架構與限制見 docs/Arch/adr/0006-user-custom-icons.md。
export interface IconResponse {
  user_icon_uid: string
  // 寫進帳戶 / 分類 icon 欄位的值：custom:<user_icon_uid>
  icon_key: string
  url: string
  content_sha256: string
  byte_size: number
  usage_count: number
  created_at: string
}

export interface IconListResponse {
  items: IconResponse[]
  quota: { used: number; limit: number }
}

export interface IconUsagesResponse {
  accounts: { account_uid: string; name: string }[]
  categories: { category_uid: string; name: string }[]
}

export interface IconDeleteResponse {
  reset_accounts: number
  reset_categories: number
}

export interface IconUploadRequest {
  image: Blob
  removeWhiteBackground: boolean
}

/** 圖片網址一律由 uid 組，不用回應裡的 url：測試與跨來源開發時 API base 不是 /api/v1。 */
export function iconImageUrl(userIconUid: string): string {
  return `${resolveApiBaseUrl()}/icons/${userIconUid}`
}

function toFormData({ image, removeWhiteBackground }: IconUploadRequest): FormData {
  const form = new FormData()
  form.append('file', image, 'icon.png')
  form.append('remove_white_background', removeWhiteBackground ? 'true' : 'false')
  return form
}

export class IconPreviewError extends Error {}

/**
 * 預覽回的是 image/png 二進位，不放進 Redux store（Blob 不可序列化），直接 fetch。
 * 失敗時把後端 detail 原文放進錯誤訊息（ADR-0006：錯誤訊息要可行動）。
 */
export async function previewIcon(request: IconUploadRequest, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${resolveApiBaseUrl()}/icons/preview`, {
    method: 'POST',
    body: toFormData(request),
    credentials: 'include',
    signal,
  })
  if (!res.ok) {
    let detail = '預覽失敗，請稍後再試'
    try {
      const body = (await res.json()) as Partial<ApiResponse<unknown>>
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      // 非 JSON（例如代理層錯誤頁）沿用預設訊息
    }
    throw new IconPreviewError(detail)
  }
  return res.blob()
}

const iconsApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['Icon', 'Account', 'Category'] })
  .injectEndpoints({
    endpoints: (build) => ({
      listIcons: build.query<IconListResponse, void>({
        query: () => 'icons',
        transformResponse: (res: ApiResponse<IconListResponse>) => unwrapData(res),
        providesTags: [{ type: 'Icon', id: 'LIST' }],
      }),
      getIconUsages: build.query<IconUsagesResponse, string>({
        query: (userIconUid) => `icons/${userIconUid}/usages`,
        transformResponse: (res: ApiResponse<IconUsagesResponse>) => unwrapData(res),
        providesTags: (_result, _error, userIconUid) => [{ type: 'Icon', id: userIconUid }],
      }),
      uploadIcon: build.mutation<IconResponse, IconUploadRequest>({
        query: (request) => ({ url: 'icons', method: 'POST', body: toFormData(request) }),
        transformResponse: (res: ApiResponse<IconResponse>) => unwrapData(res),
        invalidatesTags: [{ type: 'Icon', id: 'LIST' }],
      }),
      // 刪除會把使用中的帳戶 / 分類改回預設圖示，兩邊清單都要重抓
      deleteIcon: build.mutation<IconDeleteResponse, string>({
        query: (userIconUid) => ({ url: `icons/${userIconUid}`, method: 'DELETE' }),
        transformResponse: (res: ApiResponse<IconDeleteResponse>) => unwrapData(res),
        invalidatesTags: (_result, _error, userIconUid) => [
          { type: 'Icon', id: 'LIST' },
          { type: 'Icon', id: userIconUid },
          { type: 'Account', id: 'LIST' },
          { type: 'Category', id: 'LIST' },
        ],
      }),
    }),
    overrideExisting: false,
  })

export const {
  useListIconsQuery,
  useGetIconUsagesQuery,
  useUploadIconMutation,
  useDeleteIconMutation,
} = iconsApi
