import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AssetsPage from './page'

// tsconfig `strict`（noUncheckedIndexedAccess）讓 `getAllByLabelText(...)[n]` 型別為
// `HTMLElement | undefined`；改用標題定位各表單範圍內查詢，避免陣列索引與非空斷言。
function getFormByHeading(headingText: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: headingText })
  const form = heading.closest('form')
  if (form === null) throw new Error(`找不到標題「${headingText}」所屬的 form`)
  return form
}

// 負債刪除走 <ConfirmDialog>，內部經 <Dialog> 呼叫 useReducedMotion()，jsdom 預設沒有
// matchMedia，需手動 stub（同 accounts/page.test.tsx / categories/page.test.tsx 的作法）。
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

// 同 BudgetsPage.test.tsx：msw 尚未成為 devDependency，直接 mock RTK Query hook 的回傳值，而非
// 起假 HTTP server。
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}))

const useGetMeQuery = vi.fn()
vi.mock('@/lib/api/authApi', () => ({
  useGetMeQuery: () => useGetMeQuery(),
}))

const createFinancialAsset = vi.fn()
const useCreateFinancialAssetMutation = vi.fn()
const updateFinancialAsset = vi.fn()
const useUpdateFinancialAssetMutation = vi.fn()
const useListFinancialAssetsQuery = vi.fn()
const createLiability = vi.fn()
const useCreateLiabilityMutation = vi.fn()
const updateLiability = vi.fn()
const useUpdateLiabilityMutation = vi.fn()
const deleteLiability = vi.fn()
const useDeleteLiabilityMutation = vi.fn()
const useListLiabilitiesQuery = vi.fn()
vi.mock('@/lib/api/assetsApi', () => ({
  useCreateFinancialAssetMutation: () => useCreateFinancialAssetMutation(),
  useUpdateFinancialAssetMutation: () => useUpdateFinancialAssetMutation(),
  useListFinancialAssetsQuery: () => useListFinancialAssetsQuery(),
  useCreateLiabilityMutation: () => useCreateLiabilityMutation(),
  useUpdateLiabilityMutation: () => useUpdateLiabilityMutation(),
  useDeleteLiabilityMutation: () => useDeleteLiabilityMutation(),
  useListLiabilitiesQuery: () => useListLiabilitiesQuery(),
}))

const STOCK_ASSET = {
  financial_asset_uid: 'a1',
  asset_type: 'stock',
  name: '台積電',
  input_quantity: '2.0000',
  input_unit: '張',
  base_quantity: '2000.0000',
  principal_amount: '400000.00',
}

const METAL_ASSET = {
  financial_asset_uid: 'a2',
  asset_type: 'metal',
  name: '黃金',
  input_quantity: '5.0000',
  input_unit: '錢',
  base_quantity: '5.0000',
  principal_amount: null,
}

const LIABILITY = {
  liability_uid: 'l1',
  name: '房貸',
  amount: '2000000.00',
  interest_rate: '2.10',
}

describe('AssetsPage', () => {
  beforeEach(() => {
    stubMatchMedia()
    replace.mockClear()
    useGetMeQuery.mockReset().mockReturnValue({ isLoading: false, isError: false })

    createFinancialAsset.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ ...STOCK_ASSET }),
    })
    useCreateFinancialAssetMutation.mockReset().mockReturnValue([
      createFinancialAsset,
      { isLoading: false, error: undefined },
    ])
    updateFinancialAsset.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ ...STOCK_ASSET }),
    })
    useUpdateFinancialAssetMutation.mockReset().mockReturnValue([
      updateFinancialAsset,
      { isLoading: false, error: undefined },
    ])
    useListFinancialAssetsQuery.mockReset().mockReturnValue({
      data: { items: [STOCK_ASSET, METAL_ASSET], total: 2 },
      isLoading: false,
      error: undefined,
    })

    createLiability.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ ...LIABILITY }),
    })
    useCreateLiabilityMutation.mockReset().mockReturnValue([
      createLiability,
      { isLoading: false, error: undefined },
    ])
    updateLiability.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ ...LIABILITY, amount: '1900000.00' }),
    })
    useUpdateLiabilityMutation.mockReset().mockReturnValue([
      updateLiability,
      { isLoading: false, error: undefined },
    ])
    deleteLiability.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve(undefined),
    })
    useDeleteLiabilityMutation.mockReset().mockReturnValue([
      deleteLiability,
      { isLoading: false, error: undefined },
    ])
    useListLiabilitiesQuery.mockReset().mockReturnValue({
      data: { items: [LIABILITY], total: 1 },
      isLoading: false,
      error: undefined,
    })
  })

  it('送出股票表單觸發 createFinancialAsset mutation（asset_type: stock）', async () => {
    render(<AssetsPage />)

    fireEvent.change(screen.getByLabelText('股票代號 / 名稱'), {
      target: { value: '台積電' },
    })
    const stockForm = getFormByHeading('新增股票持股')
    fireEvent.change(within(stockForm).getByLabelText('數量'), { target: { value: '2' } })
    fireEvent.change(within(stockForm).getByLabelText('本金'), { target: { value: '400000' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新增股票' }))
    })

    expect(createFinancialAsset).toHaveBeenCalledWith({
      asset_type: 'stock',
      name: '台積電',
      input_quantity: '2',
      input_unit: '張',
      principal_amount: '400000',
    })
  })

  it('送出貴金屬表單觸發 createFinancialAsset mutation（asset_type: metal）', async () => {
    render(<AssetsPage />)

    fireEvent.change(screen.getByLabelText('品項（例：黃金）'), {
      target: { value: '黃金' },
    })
    const metalForm = getFormByHeading('新增貴金屬持有')
    fireEvent.change(within(metalForm).getByLabelText('數量'), { target: { value: '5' } })
    fireEvent.change(within(metalForm).getByLabelText('本金'), { target: { value: '30000' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新增貴金屬' }))
    })

    expect(createFinancialAsset).toHaveBeenCalledWith({
      asset_type: 'metal',
      name: '黃金',
      input_quantity: '5',
      input_unit: '錢',
      principal_amount: '30000',
    })
  })

  it('送出負債表單觸發 createLiability mutation，利率留空時送出 null', async () => {
    render(<AssetsPage />)

    fireEvent.change(screen.getByLabelText('名稱'), { target: { value: '房貸' } })
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '2000000' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新增負債' }))
    })

    expect(createLiability).toHaveBeenCalledWith({
      name: '房貸',
      amount: '2000000',
      interest_rate: null,
    })
  })

  it('金融資產清單顯示股票與貴金屬', () => {
    render(<AssetsPage />)
    expect(screen.getByText('台積電')).toBeInTheDocument()
    expect(screen.getByText('股票')).toBeInTheDocument()
    expect(screen.getByText('黃金')).toBeInTheDocument()
    expect(screen.getByText('貴金屬')).toBeInTheDocument()
  })

  it('金融資產清單顯示本金，null 時顯示 em dash', () => {
    render(<AssetsPage />)
    expect(screen.getByText('400000.00')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('負債清單顯示名稱、金額與利率', () => {
    render(<AssetsPage />)
    expect(screen.getByText('房貸')).toBeInTheDocument()
    expect(screen.getByText('2000000.00')).toBeInTheDocument()
    expect(screen.getByText('2.10%')).toBeInTheDocument()
  })

  it('尚未新增資產／負債時顯示提示文字', () => {
    useListFinancialAssetsQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: undefined,
    })
    useListLiabilitiesQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: undefined,
    })
    render(<AssetsPage />)
    expect(screen.getByText('尚未新增任何金融資產')).toBeInTheDocument()
    expect(screen.getByText('尚未新增任何負債')).toBeInTheDocument()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('編輯金融資產：修改數量與本金後儲存，呼叫 updateFinancialAsset 帶正確 payload', async () => {
    render(<AssetsPage />)

    fireEvent.click(screen.getByLabelText('編輯 台積電'))
    fireEvent.change(screen.getByLabelText('台積電 數量'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('台積電 本金'), { target: { value: '600000' } })

    await act(async () => {
      fireEvent.click(screen.getByLabelText('儲存 台積電'))
    })

    expect(updateFinancialAsset).toHaveBeenCalledExactlyOnceWith({
      financial_asset_uid: 'a1',
      name: '台積電',
      input_quantity: '3',
      input_unit: '張',
      principal_amount: '600000',
    })
  })

  it('取消編輯金融資產不呼叫 updateFinancialAsset', () => {
    render(<AssetsPage />)

    fireEvent.click(screen.getByLabelText('編輯 台積電'))
    fireEvent.change(screen.getByLabelText('台積電 數量'), { target: { value: '3' } })
    fireEvent.click(screen.getByLabelText('取消編輯 台積電'))

    expect(updateFinancialAsset).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('台積電 數量')).not.toBeInTheDocument()
  })

  it('負債還款：輸入小於目前金額的還款金額，呼叫 updateLiability 帶扣減後金額', async () => {
    render(<AssetsPage />)

    fireEvent.click(screen.getByLabelText('還款 房貸'))
    fireEvent.change(screen.getByLabelText('房貸 還款金額'), { target: { value: '100000' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '確認還款' }))
    })

    expect(updateLiability).toHaveBeenCalledExactlyOnceWith({
      liability_uid: 'l1',
      amount: '1900000.00',
    })
  })

  it('負債還款金額大於等於目前金額時，前端擋下不送出並顯示提示改用刪除', () => {
    render(<AssetsPage />)

    fireEvent.click(screen.getByLabelText('還款 房貸'))
    fireEvent.change(screen.getByLabelText('房貸 還款金額'), { target: { value: '2000000' } })

    expect(screen.getByRole('button', { name: '確認還款' })).toBeDisabled()
    expect(
      screen.getByText('還款金額須大於 0 且小於目前金額；全部還清請改用「刪除」'),
    ).toBeInTheDocument()
    expect(updateLiability).not.toHaveBeenCalled()
  })

  it('刪除負債走 ConfirmDialog：點刪除按鈕開對話框，確認後才呼叫 deleteLiability', async () => {
    render(<AssetsPage />)

    fireEvent.click(screen.getByLabelText('刪除 房貸'))

    await waitFor(() =>
      expect(screen.getByText('刪除後將無法復原，如尚未還清請改用「還款」逐步扣減金額')).toBeInTheDocument(),
    )
    expect(deleteLiability).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '刪除' }))
    })

    expect(deleteLiability).toHaveBeenCalledExactlyOnceWith('l1')
  })

  it('取消刪除負債對話框不呼叫 deleteLiability', async () => {
    render(<AssetsPage />)

    fireEvent.click(screen.getByLabelText('刪除 房貸'))
    await waitFor(() => expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(deleteLiability).not.toHaveBeenCalled()
  })
})
