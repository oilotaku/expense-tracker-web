import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PieLabelRenderProps } from 'recharts'
import { CategoryBarChart } from './CategoryBarChart'
import {
  CategoryLegend,
  CategoryPieChart,
  foldCategorySlices,
  renderPercentLabel,
  type CategorySlice,
} from './CategoryPieChart'

// PieLabelRenderProps 是 recharts 內部完整的 Pie sector 資料型別，renderPercentLabel 只讀取其中
// 幾何相關的子集，測試用 Partial 補齊必要欄位即可，不用湊出完整 PieSectorDataItem。
function labelProps(overrides: Partial<PieLabelRenderProps>): PieLabelRenderProps {
  return { cx: 100, cy: 100, midAngle: 45, innerRadius: 50, outerRadius: 80, ...overrides } as PieLabelRenderProps
}

describe('renderPercentLabel', () => {
  // 使用者回報「圓餅圖%字不明顯」：標籤疊在切片本身的飽和色塊上，`--color-text-secondary`
  // 對比度不足。改用白字（--color-text-inverse）+ 深色半透明描邊做 halo，不受切片顏色影響。
  it('文字用高對比的 --color-text-inverse，並帶深色描邊 halo 確保疊在任何切片色上都看得清楚', () => {
    const label = renderPercentLabel(labelProps({ percent: 0.42 }))
    expect(label).not.toBeNull()

    const props = (label as { props: Record<string, unknown> }).props
    expect(props.fill).toBe('var(--color-text-inverse)')
    expect(props.stroke).toBeTruthy()
    expect(props.strokeWidth).toBeGreaterThan(0)
    expect(props.children).toBe('42%')
  })

  it('占比低於 5% 時不畫標籤，避免窄切片擠爆文字', () => {
    expect(renderPercentLabel(labelProps({ percent: 0.04 }))).toBeNull()
  })

  it('缺少必要幾何參數時不畫標籤', () => {
    expect(renderPercentLabel({ percent: 0.5 } as PieLabelRenderProps)).toBeNull()
  })
})

// 系統預設分類就有「其他」（design-spec A17），超過 8 類時合併桶也叫「其他」就會出現兩個同名項目
const TEN_CATEGORIES: CategorySlice[] = [
  { id: 'c1', label: '媽', amount: 10000 },
  { id: 'c2', label: '保險', amount: 5000 },
  { id: 'c3', label: '柔', amount: 4601 },
  { id: 'c4', label: '其他', amount: 4500 },
  { id: 'c5', label: '餐飲', amount: 2824 },
  { id: 'c6', label: '電信', amount: 2399 },
  { id: 'c7', label: '社交', amount: 1236 },
  { id: 'c8', label: '交通', amount: 1200 },
  { id: 'c9', label: '娛樂', amount: 200 },
  { id: 'c10', label: '購物', amount: 50 },
]

describe('foldCategorySlices', () => {
  it('S-CHART-01 超過 8 類時合併桶叫「其餘 N 類」，不跟使用者自己的「其他」分類同名', () => {
    const slices = foldCategorySlices(TEN_CATEGORIES)
    const labels = slices.map((slice) => slice.label)
    expect(labels).toHaveLength(9)
    expect(labels.at(-1)).toBe('其餘 2 類')
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('CategoryLegend', () => {
  it('S-CHART-02 圖例每項帶百分比（圖上的 % 讀屏聽不到），清單有名稱', () => {
    const slices = foldCategorySlices([
      { id: 'a', label: '餐飲', amount: 7490 },
      { id: 'b', label: '交通', amount: 2500 },
      { id: 'c', label: '停車', amount: 10 },
    ])
    render(<CategoryLegend slices={slices} formatValue={(n) => `NT$${n}`} />)
    const list = screen.getByRole('list', { name: '支出分類明細' })
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('餐飲NT$749075%')
    expect(items[1]).toHaveTextContent('交通NT$250025%')
    expect(items[2]).toHaveTextContent('停車NT$10<1%')
  })
})

describe('圖形本身對讀屏隱藏，由圖例提供資料', () => {
  it.each([
    ['圓餅圖', CategoryPieChart],
    ['長條圖', CategoryBarChart],
  ])('S-CHART-03 %s：圖形區塊 aria-hidden、沒有 role=application', (_name, Chart) => {
    const { container } = render(<Chart data={TEN_CATEGORIES} />)
    const chartBox = container.querySelector('.recharts-responsive-container')?.parentElement
    expect(chartBox).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('[role="application"]')).toBeNull()
    expect(screen.getByRole('list', { name: '支出分類明細' })).toBeInTheDocument()
  })
})
