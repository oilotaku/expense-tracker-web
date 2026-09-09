import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AssetsPage from './page'

// tsconfig `strict`（noUncheckedIndexedAccess）讓 `getAllByLabelText(...)[n]` 型別為
// `HTMLElement | undefined`；改用標題定位各表單範圍內查詢，避免陣列索引與非空斷言。
function getFormByHeading(headingText: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: headingText })
  const form = heading.closest('form')
  if (form === null) throw new Error(`找不到標題「${headingText}」所屬的 form`)
  return form
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
const useListFinancialAssetsQuery = vi.fn()
const createLiability = vi.fn()
const useCreateLiabilityMutation = vi.fn()
const useListLiabilitiesQuery = vi.fn()
vi.mock('@/lib/api/assetsApi', () => ({
  useCreateFinancialAssetMutation: () => useCreateFinancialAssetMutation(),
  useListFinancialAssetsQuery: () => useListFinancialAssetsQuery(),
  useCreateLiabilityMutation: () => useCreateLiabilityMutation(),
  useListLiabilitiesQuery: () => useListLiabilitiesQuery(),
}))

const STOCK_ASSET = {
  financial_asset_uid: 'a1',
  asset_type: 'stock',
  name: '台積電',
  input_quantity: '2.0000',
  input_unit: '張',
  base_quantity: '2000.0000',
  principal_amount: '120000.00',
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
    replace.mockClear()
    useGetMeQuery.mockReset().mockReturnValue({ isLoading: false, isError: false })

    createFinancialAsset.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ ...STOCK_ASSET }),
    })
    useCreateFinancialAssetMutation.mockReset().mockReturnValue([
      createFinancialAsset,
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
    fireEvent.change(within(stockForm).getByLabelText('本金'), { target: { value: '120000' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新增股票' }))
    })

    expect(createFinancialAsset).toHaveBeenCalledWith({
      asset_type: 'stock',
      name: '台積電',
      input_quantity: '2',
      input_unit: '張',
      principal_amount: '120000',
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
    expect(screen.getByText('120000.00')).toBeInTheDocument()
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
})
