import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CategoriesPage from './page'

// 同 budgets/page.test.tsx / recurring/page.test.tsx：page 層測試直接 mock RTK Query hook 的
// 回傳值來驗證表單 / 清單邏輯（真實 HTTP mock 走 lib/api/categoriesApi.test.ts，→ FE-012）。
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/categories',
}))

// 本頁的刪除流程走 <ConfirmDialog>，內部經 <Dialog> 呼叫 useReducedMotion()，jsdom 預設沒有
// matchMedia，需手動 stub（同 ConfirmDialog.test.tsx / Dialog.test.tsx 的作法）。
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

const useGetMeQuery = vi.fn()
vi.mock('@/lib/api/authApi', () => ({
  useGetMeQuery: () => useGetMeQuery(),
}))

const createCategory = vi.fn()
const updateCategory = vi.fn()
const deleteCategory = vi.fn()
const useCreateCategoryMutation = vi.fn()
const useUpdateCategoryMutation = vi.fn()
const useDeleteCategoryMutation = vi.fn()
const useListCategoriesQuery = vi.fn()
vi.mock('@/lib/api/categoriesApi', () => ({
  useCreateCategoryMutation: () => useCreateCategoryMutation(),
  useUpdateCategoryMutation: () => useUpdateCategoryMutation(),
  useDeleteCategoryMutation: () => useDeleteCategoryMutation(),
  useListCategoriesQuery: () => useListCategoriesQuery(),
}))

const SUBSCRIPTION_CATEGORY = {
  category_uid: 'c-subscription',
  name: '訂閱',
  color: '#3E8FD0',
  icon: 'subscription',
}

describe('CategoriesPage', () => {
  beforeEach(() => {
    stubMatchMedia()
    useGetMeQuery.mockReset().mockReturnValue({ isLoading: false, isError: false })

    createCategory.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ ...SUBSCRIPTION_CATEGORY }),
    })
    useCreateCategoryMutation.mockReset().mockReturnValue([
      createCategory,
      { isLoading: false, error: undefined },
    ])

    updateCategory.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(SUBSCRIPTION_CATEGORY) })
    useUpdateCategoryMutation.mockReset().mockReturnValue([updateCategory, { isLoading: false, error: undefined }])

    deleteCategory.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(undefined) })
    useDeleteCategoryMutation.mockReset().mockReturnValue([deleteCategory, { isLoading: false, error: undefined }])

    useListCategoriesQuery.mockReset().mockReturnValue({
      data: { items: [SUBSCRIPTION_CATEGORY], total: 1 },
      isLoading: false,
      error: undefined,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('render 分類清單，含「訂閱」分類且徽章套用其 color', () => {
    render(<CategoriesPage />)
    expect(screen.getByText('訂閱')).toBeInTheDocument()
    const badge = screen.getByLabelText('編輯 訂閱').querySelector('span')
    expect(badge).toHaveStyle({ backgroundColor: '#3E8FD0' })
  })

  it('新增分類：填名稱、選色票、選圖示後送出，一併帶入 createCategory', async () => {
    render(<CategoriesPage />)

    fireEvent.change(screen.getByLabelText('名稱'), { target: { value: '保險' } })
    fireEvent.click(screen.getByRole('button', { name: '選擇顏色 #E8834B' }))
    fireEvent.click(screen.getByRole('button', { name: '醫療' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ 新增分類' }))
    })

    expect(createCategory).toHaveBeenCalledExactlyOnceWith({
      name: '保險',
      color: '#E8834B',
      icon: 'medical',
    })
  })

  it('重名前端即時驗證：輸入已存在分類名稱立即顯示錯誤並停用送出按鈕，不呼叫 createCategory', () => {
    render(<CategoriesPage />)

    fireEvent.change(screen.getByLabelText('名稱'), { target: { value: '訂閱' } })

    expect(screen.getByRole('alert')).toHaveTextContent('已存在同名分類')
    expect(screen.getByRole('button', { name: '+ 新增分類' })).toBeDisabled()
    expect(createCategory).not.toHaveBeenCalled()
  })

  it('新增分類後端回傳 409（重名競態）時顯示錯誤訊息', () => {
    useCreateCategoryMutation.mockReturnValue([
      createCategory,
      { isLoading: false, error: { status: 409, data: { detail: '已存在同名分類' } } },
    ])
    render(<CategoriesPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('已存在同名分類')
  })

  it('刪除分類走 ConfirmDialog：點刪除按鈕開對話框，確認後才呼叫 deleteCategory', async () => {
    render(<CategoriesPage />)

    expect(screen.queryByText('刪除後不影響既有交易紀錄，但無法用此分類建立新交易')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('刪除 訂閱'))

    await waitFor(() =>
      expect(
        screen.getByText('刪除後不影響既有交易紀錄，但無法用此分類建立新交易'),
      ).toBeInTheDocument(),
    )
    expect(deleteCategory).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '刪除' }))
    })

    expect(deleteCategory).toHaveBeenCalledExactlyOnceWith('c-subscription')
  })

  it('取消刪除對話框不呼叫 deleteCategory', async () => {
    render(<CategoriesPage />)

    fireEvent.click(screen.getByLabelText('刪除 訂閱'))
    await waitFor(() => expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(deleteCategory).not.toHaveBeenCalled()
  })

  it('尚未建立任何分類時顯示提示文字', () => {
    useListCategoriesQuery.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false, error: undefined })
    render(<CategoriesPage />)
    expect(screen.getByText('尚未建立任何分類')).toBeInTheDocument()
  })
})
