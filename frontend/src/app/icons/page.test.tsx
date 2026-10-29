import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IconsPage from './page'

// 同其他 page 層測試：直接 mock RTK Query hook 驗證畫面邏輯；真實 HTTP 走 lib/api/iconsApi.test.ts（→ FE-012）
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/icons',
}))

const useGetMeQuery = vi.fn()
vi.mock('@/lib/api/authApi', () => ({
  useGetMeQuery: () => useGetMeQuery(),
}))

const useListIconsQuery = vi.fn()
const useGetIconUsagesQuery = vi.fn()
const deleteIcon = vi.fn()
vi.mock('@/lib/api/iconsApi', () => ({
  iconImageUrl: (uid: string) => `/api/v1/icons/${uid}`,
  previewIcon: vi.fn(),
  IconPreviewError: class extends Error {},
  useListIconsQuery: () => useListIconsQuery(),
  useGetIconUsagesQuery: (uid: string, options: { skip: boolean }) => useGetIconUsagesQuery(uid, options),
  useUploadIconMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteIconMutation: () => [deleteIcon, { isLoading: false }],
}))

function stubMatchMedia(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      matches: false,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
}

function icon(uid: string, usage: number) {
  return {
    user_icon_uid: uid,
    icon_key: `custom:${uid}`,
    url: `/api/v1/icons/${uid}`,
    content_sha256: uid,
    byte_size: 100,
    usage_count: usage,
    created_at: '2026-10-29T16:00:00+08:00',
  }
}

describe('IconsPage', () => {
  beforeEach(() => {
    stubMatchMedia()
    useGetMeQuery.mockReset().mockReturnValue({ isLoading: false, isError: false })
    useGetIconUsagesQuery.mockReset().mockReturnValue({ data: undefined, isLoading: false })
    deleteIcon.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ reset_accounts: 2, reset_categories: 1 }),
    })
  })

  it('上方是上傳區與配額，沒有圖示時顯示空狀態', () => {
    useListIconsQuery.mockReturnValue({
      data: { items: [], quota: { used: 0, limit: 50 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<IconsPage />)
    expect(screen.getByRole('heading', { name: '我的圖示' })).toBeInTheDocument()
    expect(screen.getByText('拖曳圖片到這裡，或點擊選擇')).toBeInTheDocument()
    expect(screen.getByText('已使用 0 / 50')).toBeInTheDocument()
    expect(screen.getByText('還沒有上傳圖示')).toBeInTheDocument()
  })

  it('已上傳圖示依清單順序顯示使用次數', () => {
    useListIconsQuery.mockReturnValue({
      data: { items: [icon('new', 3), icon('old', 0)], quota: { used: 2, limit: 50 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<IconsPage />)
    const buttons = screen.getAllByRole('button', { name: /^圖示，/ })
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['圖示，3 個使用中', '圖示，未使用'])
  })

  it('配額已滿時上傳區停用並說明原因', () => {
    useListIconsQuery.mockReturnValue({
      data: { items: [icon('a', 0)], quota: { used: 50, limit: 50 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<IconsPage />)
    expect(screen.getByText('已達 50 張上限，請先刪除不用的圖示')).toBeInTheDocument()
  })

  it('點圖示看使用情況，刪除確認文字列出會改回預設的數量', async () => {
    useListIconsQuery.mockReturnValue({
      data: { items: [icon('u-1', 3)], quota: { used: 1, limit: 50 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    useGetIconUsagesQuery.mockReturnValue({
      data: {
        accounts: [
          { account_uid: 'a-1', name: '現金' },
          { account_uid: 'a-2', name: '零錢包' },
        ],
        categories: [{ category_uid: 'c-1', name: '早餐' }],
      },
      isLoading: false,
    })
    render(<IconsPage />)
    fireEvent.click(screen.getByRole('button', { name: '圖示，3 個使用中' }))

    expect(await screen.findByText('圖示詳細')).toBeInTheDocument()
    expect(screen.getByText('帳戶：現金')).toBeInTheDocument()
    expect(screen.getByText('分類：早餐')).toBeInTheDocument()
    expect(useGetIconUsagesQuery).toHaveBeenLastCalledWith('u-1', expect.objectContaining({ skip: false }))

    fireEvent.click(screen.getByRole('button', { name: '刪除' }))
    expect(await screen.findByText('有 2 個帳戶、1 個分類會改回預設圖示，確定刪除？')).toBeInTheDocument()
    const confirmButtons = screen.getAllByRole('button', { name: '刪除' })
    fireEvent.click(confirmButtons[confirmButtons.length - 1] as HTMLElement)
    await waitFor(() => expect(deleteIcon).toHaveBeenCalledExactlyOnceWith('u-1'))
  })
})
