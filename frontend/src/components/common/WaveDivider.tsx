import type { ReactNode } from 'react'
import { curveBasis, line } from 'd3-shape'

export interface WaveDividerProps {
  color?: string
  className?: string
}

const VIEW_WIDTH = 1440
const VIEW_HEIGHT = 120
const SAMPLE_COUNT = 12

// 純裝飾用波浪路徑，用 d3-shape 依固定取樣點產生平滑曲線，再收尾封閉成可填色區塊
// （design-spec §4：用於 Login/Dashboard hero 背景，`aria-hidden`）。純函式、無互動，
// 不需要 'use client'，可留在 Server Component 樹內渲染，減少 client bundle。
function buildWavePath(): string {
  const points: Array<[number, number]> = []
  for (let i = 0; i <= SAMPLE_COUNT; i += 1) {
    const x = (VIEW_WIDTH / SAMPLE_COUNT) * i
    const y = VIEW_HEIGHT * 0.35 + Math.sin((i / SAMPLE_COUNT) * Math.PI * 2) * (VIEW_HEIGHT * 0.22)
    points.push([x, y])
  }
  const wave = line().curve(curveBasis)(points) ?? ''
  return `${wave} L ${VIEW_WIDTH} ${VIEW_HEIGHT} L 0 ${VIEW_HEIGHT} Z`
}

const WAVE_PATH = buildWavePath()

/**
 * 純裝飾用 SVG 波浪（`aria-hidden`），供 Login / Dashboard hero 背景使用（`→` design-spec §4）。
 * `color` 預設走品牌淡底 token，呼叫端可依所在區塊背景覆寫。
 */
export function WaveDivider({ color = 'var(--color-primary-100)', className }: WaveDividerProps): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      className={`h-full w-full ${className ?? ''}`}
    >
      <path d={WAVE_PATH} fill={color} />
    </svg>
  )
}
