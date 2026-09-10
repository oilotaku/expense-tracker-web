'use client'

import type { ReactNode } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type PieLabelRenderProps } from 'recharts'

export interface CategorySlice {
  id: string
  label: string
  amount: number
}

export interface FoldedCategorySlice extends CategorySlice {
  color: string
}

const MAX_VISIBLE_CATEGORIES = 6
const OTHER_SLICE_ID = '__other__'
const OTHER_LABEL = '其他'

/**
 * design-spec §2.3/§2.3.1 圖表色票：CSS variable（非寫死 hex）讓圓餅/長條圖隨 Light/Dark 主題
 * 自動改值，元件本身不寫任何 dark 專屬條件邏輯（→ §2.7 元件無感知）。
 */
export const CATEGORY_CHART_COLOR_VARS: readonly string[] = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
]

export const CATEGORY_CHART_OTHER_COLOR = 'var(--color-chart-other)'

/**
 * design-spec §2.3 Pie/Bar 折疊規則：超過 6 類時取金額前 6 大分類 + 其餘全部併為「其他」（固定
 * 中性灰，非生成色），最多 7 段。≤6 類則全部個別上色，不折疊。`CategoryBarChart` 共用本函式，
 * 確保兩種圖表類型的折疊結果與配色順序一致。
 */
export function foldCategorySlices(data: readonly CategorySlice[]): FoldedCategorySlice[] {
  const sorted = [...data].sort((a, b) => b.amount - a.amount)

  if (sorted.length <= MAX_VISIBLE_CATEGORIES) {
    return sorted.map((slice, index) => ({
      ...slice,
      color: CATEGORY_CHART_COLOR_VARS[index] ?? CATEGORY_CHART_OTHER_COLOR,
    }))
  }

  const visible = sorted.slice(0, MAX_VISIBLE_CATEGORIES)
  const rest = sorted.slice(MAX_VISIBLE_CATEGORIES)
  const otherAmount = rest.reduce((sum, slice) => sum + slice.amount, 0)

  return [
    ...visible.map((slice, index) => ({ ...slice, color: CATEGORY_CHART_COLOR_VARS[index] as string })),
    { id: OTHER_SLICE_ID, label: OTHER_LABEL, amount: otherAmount, color: CATEGORY_CHART_OTHER_COLOR },
  ]
}

export interface CategoryLegendProps {
  slices: readonly FoldedCategorySlice[]
  formatValue: (amount: number) => string
}

/**
 * 圖表下方恆常顯示的圖例（非 hover-only）：色塊 + 分類名 + 直接數值標籤。design-spec §2.3 要求
 * 8 色調色盤對白底 contrast 為 WARN，**必**搭配這個 relief channel；文字一律走
 * `--color-text-*` token，不用圖表色當文字色。Pie/Bar 共用同一份，folded slices 已含配色，
 * 不用重繞 recharts 內建 Legend payload。
 */
export function CategoryLegend({ slices, formatValue }: CategoryLegendProps): ReactNode {
  return (
    <ul
      className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pt-3 text-sm text-text-secondary"
      role="list"
    >
      {slices.map((slice) => (
        <li key={slice.id} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: slice.color }}
          />
          <span>{slice.label}</span>
          <span className="tabular-nums text-text-primary">{formatValue(slice.amount)}</span>
        </li>
      ))}
    </ul>
  )
}

export interface CategoryPieChartProps {
  data: readonly CategorySlice[]
  formatValue?: (amount: number) => string
}

const defaultFormatValue = (amount: number): string => amount.toLocaleString('zh-Hant-TW')
const RADIAN = Math.PI / 180

export function renderPercentLabel(props: PieLabelRenderProps): ReactNode {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props
  if (
    typeof cx !== 'number' ||
    typeof cy !== 'number' ||
    typeof midAngle !== 'number' ||
    typeof innerRadius !== 'number' ||
    typeof outerRadius !== 'number' ||
    percent === undefined ||
    percent < 0.05
  ) {
    return null
  }
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text
      x={x}
      y={y}
      fill="var(--color-text-inverse)"
      // 標籤疊在切片本身的色塊上（不是白底），`--color-text-secondary` 對飽和的圖表色
      // 對比度不足（使用者回報「%字不明顯」）。改用白字 + 半透明深色描邊做成不受切片顏色
      // 影響的 halo 效果，跟切片本身用哪個 --color-chart-* 色票無關，深/淺色都看得清楚。
      stroke="rgba(0, 0, 0, 0.55)"
      strokeWidth={3}
      strokeLinejoin="round"
      paintOrder="stroke"
      fontSize={12}
      fontWeight={600}
      textAnchor="middle"
      dominantBaseline="central"
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  )
}

/**
 * 分類圓餅圖（design-spec §2.3/§4）：超過 6 類自動折疊為「其他」（`foldCategorySlices`），
 * 色票走 CSS variable，切片內文字（百分比標籤）與下方圖例一律用 `--color-text-*` token。
 */
export function CategoryPieChart({ data, formatValue = defaultFormatValue }: CategoryPieChartProps): ReactNode {
  const slices = foldCategorySlices(data)

  if (slices.length === 0) {
    return <p className="py-8 text-center text-sm text-text-muted">尚無分類資料</p>
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={[...slices]}
            dataKey="amount"
            nameKey="label"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            label={renderPercentLabel}
            labelLine={false}
          >
            {slices.map((slice) => (
              <Cell key={slice.id} fill={slice.color} stroke="var(--color-surface)" />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatValue(Number(value))} />
        </PieChart>
      </ResponsiveContainer>
      <CategoryLegend slices={slices} formatValue={formatValue} />
    </div>
  )
}
