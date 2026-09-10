import { describe, expect, it } from 'vitest'
import type { PieLabelRenderProps } from 'recharts'
import { renderPercentLabel } from './CategoryPieChart'

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
