'use client'

import type { ReactNode } from 'react'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { CategoryLegend, foldCategorySlices, type CategorySlice } from './CategoryPieChart'

export interface CategoryBarChartProps {
  data: readonly CategorySlice[]
  formatValue?: (amount: number) => string
}

const defaultFormatValue = (amount: number): string => amount.toLocaleString('zh-Hant-TW')

/**
 * 分類長條圖（design-spec §2.3/§4）：與 `CategoryPieChart` 共用 `foldCategorySlices`（超過
 * 6 類自動折疊為「其他」）與同一份色票，確保切換圖表類型時分類配色一致。長條上方直接標數值、
 * 下方恆常顯示圖例，兩者皆走 `--color-text-*` token（→ §2.3 relief channel 要求）。
 */
export function CategoryBarChart({ data, formatValue = defaultFormatValue }: CategoryBarChartProps): ReactNode {
  const slices = foldCategorySlices(data)

  if (slices.length === 0) {
    return <p className="py-8 text-center text-sm text-text-muted">尚無分類資料</p>
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={[...slices]} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={false}
          />
          <Tooltip formatter={(value) => formatValue(Number(value))} />
          <Bar dataKey="amount" radius={[8, 8, 0, 0]} maxBarSize={48}>
            {slices.map((slice) => (
              <Cell key={slice.id} fill={slice.color} />
            ))}
            <LabelList
              dataKey="amount"
              position="top"
              formatter={(label) => formatValue(Number(label))}
              fill="var(--color-text-secondary)"
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <CategoryLegend slices={slices} formatValue={formatValue} />
    </div>
  )
}
