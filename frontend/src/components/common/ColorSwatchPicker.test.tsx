import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CHART_SWATCH_COLORS, ColorSwatchPicker } from './ColorSwatchPicker'

const [firstSwatch, secondSwatch, thirdSwatch] = CHART_SWATCH_COLORS as readonly [string, string, string, ...string[]]

describe('ColorSwatchPicker', () => {
  it('固定色票共 16 色且不重複，每色都有可點按鈕', () => {
    render(<ColorSwatchPicker value={firstSwatch} onChange={vi.fn()} />)
    expect(new Set(CHART_SWATCH_COLORS.map((hex) => hex.toLowerCase())).size).toBe(16)
    expect(screen.getAllByRole('button', { name: /^選擇顏色 / })).toHaveLength(16)
  })

  it('點擊色票觸發 onChange', () => {
    const onChange = vi.fn()
    render(<ColorSwatchPicker value={firstSwatch} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: `選擇顏色 ${thirdSwatch}` }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith(thirdSwatch)
  })

  it('自訂 hex 輸入格式錯誤時不觸發 onChange，且送出按鈕 disabled', () => {
    const onChange = vi.fn()
    render(<ColorSwatchPicker value={firstSwatch} onChange={onChange} />)
    const input = screen.getByLabelText('自訂 hex')
    fireEvent.change(input, { target: { value: 'not-a-hex' } })
    const applyButton = screen.getByRole('button', { name: '套用' })
    expect(applyButton).toBeDisabled()
    fireEvent.click(applyButton)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('格式需為 #RRGGBB（例如 #8B6ED6）')).toBeInTheDocument()
  })

  it('自訂 hex 輸入格式正確時，按套用觸發 onChange', () => {
    const onChange = vi.fn()
    render(<ColorSwatchPicker value={firstSwatch} onChange={onChange} />)
    const input = screen.getByLabelText('自訂 hex')
    fireEvent.change(input, { target: { value: '#123ABC' } })
    fireEvent.click(screen.getByRole('button', { name: '套用' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('#123ABC')
  })

  it('disabled 時色票按鈕皆 disabled', () => {
    render(<ColorSwatchPicker value={firstSwatch} onChange={() => {}} disabled />)
    expect(screen.getByRole('button', { name: `選擇顏色 ${secondSwatch}` })).toBeDisabled()
  })
})
