'use client'

import type { ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface TrendPoint {
  date: string
  income: number
  expense: number
}

interface TrendSeriesMeta {
  key: 'income' | 'expense'
  label: string
  color: string
}

// design-spec §2.3 折線圖最多 2 series，用既有收入/支出語意色（非圖表 categorical 8 色票），
// 落在「1–3 色安全」區間，不受 Pie/Bar 的折疊規則影響。
const TREND_SERIES: readonly TrendSeriesMeta[] = [
  { key: 'income', label: '收入', color: 'var(--color-income-700)' },
  { key: 'expense', label: '支出', color: 'var(--color-expense-700)' },
]

export interface TrendLineChartProps {
  data: readonly TrendPoint[]
  formatValue?: (amount: number) => string
}

const defaultFormatValue = (amount: number): string => amount.toLocaleString('zh-Hant-TW')

/**
 * 收支趨勢折線圖（design-spec §2.3/§6）：`<Area type="monotone">` 一次畫出平滑線（等同
 * `curveMonotoneX`，避免 `curveBasis` 偏離實際資料點）與 10% 透明度面積 wash，不疊加額外
 * `<Line>` 造成雙重描邊。圖例恆常顯示於圖表下方（非 hover-only），文字走 `--color-text-*`
 * token，不用系列色（收入/支出色）當文字色。
 */
export function TrendLineChart({ data, formatValue = defaultFormatValue }: TrendLineChartProps): ReactNode {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-text-muted">尚無趨勢資料</p>
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={[...data]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip formatter={(value) => formatValue(Number(value))} />
          {TREND_SERIES.map((series) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              strokeWidth={2}
              fill={series.color}
              fillOpacity={0.1}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <ul
        className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pt-2 text-sm text-text-secondary"
        role="list"
      >
        {TREND_SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: series.color }}
            />
            {series.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
