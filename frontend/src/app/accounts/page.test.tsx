import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AccountsPage from './page'

// 同 categories/page.test.tsx / budgets/page.test.tsx：page 層測試直接 mock RTK Query hook 的
// 回傳值來驗證表單 / 清單邏輯（真實 HTTP mock 走 lib/api/accountsApi.test.ts，→ FE-012）。
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/accounts',
}))

// 本頁的新增/刪除流程走 <Dialog>/<ConfirmDialog>，內部經 <Dialog> 呼叫 useReducedMotion()，
// jsdom 預設沒有 matchMedia，需手動 stub（同 categories/page.test.tsx / Dialog.test.tsx 的作法）。
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

const createAccount = vi.fn()
const updateAccount = vi.fn()
const deleteAccount = vi.fn()
const useCreateAccountMutation = vi.fn()
const useUpdateAccountMutation = vi.fn()
const useDeleteAccountMutation = vi.fn()
const useListAccountsQuery = vi.fn()
vi.mock('@/lib/api/accountsApi', () => ({
  useCreateAccountMutation: () => useCreateAccountMutation(),
  useUpdateAccountMutation: () => useUpdateAccountMutation(),
  useDeleteAccountMutation: () => useDeleteAccountMutation(),
  useListAccountsQuery: () => useListAccountsQuery(),
}))

const CASH_ACCOUNT = {
  account_uid: 'a-cash',
  name: '現金',
  balance: '1000.00',
  currency: 'TWD',
  color: '#8B6ED6',
  icon: 'wallet',
}

const BANK_ACCOUNT = {
  account_uid: 'a-bank',
  name: '銀行',
  balance: '5000.00',
  currency: 'TWD',
  color: '#E8834B',
  icon: 'bank',
}

describe('AccountsPage', () => {
  beforeEach(() => {
    stubMatchMedia()
    useGetMeQuery.mockReset().mockReturnValue({ isLoading: false, isError: false })

    createAccount.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ ...CASH_ACCOUNT }),
    })
    useCreateAccountMutation.mockReset().mockReturnValue([
      createAccount,
      { isLoading: false, error: undefined },
    ])

    updateAccount.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(CASH_ACCOUNT) })
    useUpdateAccountMutation.mockReset().mockReturnValue([updateAccount, { isLoading: false, error: undefined }])

    deleteAccount.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(undefined) })
    useDeleteAccountMutation.mockReset().mockReturnValue([deleteAccount, { isLoading: false, error: undefined }])

    useListAccountsQuery.mockReset().mockReturnValue({
      data: { items: [CASH_ACCOUNT, BANK_ACCOUNT], total: 2 },
      isLoading: false,
      error: undefined,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('render 帳戶清單，含帳戶名稱、餘額與依 color 上色的圖示徽章', () => {
    render(<AccountsPage />)
    expect(screen.getByText('現金')).toBeInTheDocument()
    expect(screen.getByText('銀行')).toBeInTheDocument()
    expect(screen.getByText('1000.00 TWD')).toBeInTheDocument()
    expect(screen.getByText('5000.00 TWD')).toBeInTheDocument()
  })

  it('新增帳戶：開對話框、填名稱與起始餘額、選色票與圖示後送出，一併帶入 createAccount', async () => {
    render(<AccountsPage />)

    // 桌機／行動兩個「＋ 新增帳戶」觸發按鈕皆常駐 DOM（→ FE-063 CSS-only 顯示控制，
    // 由 CSS media query 決定實際可見哪一個），測試環境不套用 Tailwind CSS，兩者皆可查得。
    fireEvent.click(screen.getAllByRole('button', { name: '＋ 新增帳戶' })[0]!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('名稱'), { target: { value: '儲蓄帳戶' } })
    fireEvent.change(screen.getByLabelText('起始餘額'), { target: { value: '2500' } })
    fireEvent.click(screen.getByRole('button', { name: '選擇顏色 #2FA98A' }))
    fireEvent.click(screen.getByRole('button', { name: '儲蓄' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '建立帳戶' }))
    })

    expect(createAccount).toHaveBeenCalledExactlyOnceWith({
      name: '儲蓄帳戶',
      balance: '2500',
      color: '#2FA98A',
      icon: 'savings',
    })
  })

  it('新增帳戶未手動選色時，預帶下一個尚未被目前帳戶清單使用的色票（避開現有 #8B6ED6 / #E8834B）', async () => {
    render(<AccountsPage />)

    fireEvent.click(screen.getAllByRole('button', { name: '＋ 新增帳戶' })[0]!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    // CHART_SWATCH_COLORS 依序為 #8B6ED6/#E8834B/#2FA98A/...；前兩個已被現有帳戶使用，
    // 預帶值應落在 #2FA98A，即該色票按鈕已是選中狀態（aria-pressed）。
    expect(screen.getByRole('button', { name: '選擇顏色 #2FA98A' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('改名：AccountCard 編輯名稱送出後呼叫 updateAccount', () => {
    render(<AccountsPage />)

    fireEvent.click(screen.getByLabelText('編輯 現金'))
    const nameInput = screen.getByLabelText('名稱')
    fireEvent.change(nameInput, { target: { value: '皮夾' } })
    fireEvent.blur(nameInput)

    expect(updateAccount).toHaveBeenCalledExactlyOnceWith({ accountUid: 'a-cash', name: '皮夾' })
  })

  it('改色：AccountCard 選色即時呼叫 updateAccount', () => {
    render(<AccountsPage />)

    fireEvent.click(screen.getByLabelText('編輯 現金'))
    fireEvent.click(screen.getByRole('button', { name: '選擇顏色 #D65FA0' }))

    expect(updateAccount).toHaveBeenCalledExactlyOnceWith({ accountUid: 'a-cash', color: '#D65FA0' })
  })

  it('改圖示：AccountCard 選圖示即時呼叫 updateAccount', () => {
    render(<AccountsPage />)

    fireEvent.click(screen.getByLabelText('編輯 現金'))
    fireEvent.click(screen.getByRole('button', { name: '信用卡' }))

    expect(updateAccount).toHaveBeenCalledExactlyOnceWith({ accountUid: 'a-cash', icon: 'creditCard' })
  })

  it('改色時儲存中會停用名稱輸入框/色票/圖示並顯示「儲存中…」，完成後恢復', async () => {
    // updateAccount 是所有帳戶共用同一顆 mutation trigger，是「這一張卡片正在儲存」而不是
    // 「isLoading 全站生效」（→ app/accounts/page.tsx savingAccountUid）；用一個手動控制的
    // Promise 卡住 unwrap()，觀察儲存中的中間狀態，再手動 resolve 驗證恢復。
    let resolveUpdate: (value: typeof CASH_ACCOUNT) => void = () => {}
    updateAccount.mockReturnValue({
      unwrap: () =>
        new Promise<typeof CASH_ACCOUNT>((resolve) => {
          resolveUpdate = resolve
        }),
    })

    render(<AccountsPage />)
    fireEvent.click(screen.getByLabelText('編輯 現金'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '選擇顏色 #D65FA0' }))
    })

    expect(screen.getByText('儲存中…')).toBeInTheDocument()
    expect(screen.getByLabelText('名稱')).toBeDisabled()
    expect(screen.getByRole('button', { name: '選擇顏色 #D65FA0' })).toBeDisabled()

    await act(async () => {
      resolveUpdate(CASH_ACCOUNT)
      await Promise.resolve()
    })

    expect(screen.queryByText('儲存中…')).not.toBeInTheDocument()
    expect(screen.getByLabelText('名稱')).not.toBeDisabled()
  })

  it('刪除帳戶走 ConfirmDialog：點刪除按鈕開對話框並顯示既有交易警告文字，確認後才呼叫 deleteAccount', async () => {
    render(<AccountsPage />)

    fireEvent.click(screen.getByLabelText('刪除 現金'))

    await waitFor(() =>
      expect(
        screen.getByText('此帳戶若有交易紀錄，需先轉移或保留歷史紀錄後再刪除，實際轉移邏輯由後端規則決定'),
      ).toBeInTheDocument(),
    )
    expect(deleteAccount).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '刪除' }))
    })

    expect(deleteAccount).toHaveBeenCalledExactlyOnceWith('a-cash')
  })

  it('取消刪除對話框不呼叫 deleteAccount', async () => {
    render(<AccountsPage />)

    fireEvent.click(screen.getByLabelText('刪除 現金'))
    await waitFor(() => expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('只剩 1 個帳戶時刪除按鈕 disabled 且顯示提示文字，不可開啟刪除確認（→ A4）', () => {
    useListAccountsQuery.mockReturnValue({
      data: { items: [CASH_ACCOUNT], total: 1 },
      isLoading: false,
      error: undefined,
    })
    render(<AccountsPage />)

    const deleteButton = screen.getByLabelText('刪除 現金')
    expect(deleteButton).toBeDisabled()
    expect(screen.getByText('至少需保留一個帳戶')).toBeInTheDocument()

    fireEvent.click(deleteButton)
    expect(screen.queryByRole('button', { name: '確認' })).not.toBeInTheDocument()
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('尚未建立任何帳戶時顯示提示文字', () => {
    useListAccountsQuery.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false, error: undefined })
    render(<AccountsPage />)
    expect(screen.getByText('尚未建立任何帳戶')).toBeInTheDocument()
  })
})
