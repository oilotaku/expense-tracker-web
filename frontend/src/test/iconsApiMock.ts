// 給「會渲染 <IconPicker>」但不測自訂圖示的測試用：同 page 層測試慣例直接 mock RTK hook，
// 真實 HTTP 行為由 lib/api/iconsApi.test.ts 以 msw 驗證（→ FE-012）。
// 用法：vi.mock('@/lib/api/iconsApi', () => import('@/test/iconsApiMock'))
import { vi } from 'vitest'

export class IconPreviewError extends Error {}

export const iconImageUrl = (uid: string): string => `/api/v1/icons/${uid}`
export const previewIcon = vi.fn()
export const useListIconsQuery = vi.fn(() => ({
  data: { items: [], quota: { used: 0, limit: 50 } },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}))
export const useGetIconUsagesQuery = vi.fn(() => ({ data: undefined, isLoading: false }))
export const useUploadIconMutation = vi.fn(() => [vi.fn(), { isLoading: false }])
export const useDeleteIconMutation = vi.fn(() => [vi.fn(), { isLoading: false }])
