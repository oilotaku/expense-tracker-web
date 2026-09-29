import type { ReactNode } from 'react'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NumericKeypad } from './NumericKeypad'

// NumericKeypad 用 motion.div 包 PIN 圓點列做 shake 動畫，jsdom 不會真的跑動畫；這裡把 motion.div
// 換成轉發 props 的純 div，並把 animate 序列化進 data-animate 屬性，讓測試能斷言「有沒有 shake」
// 而不依賴真實動畫幀（同 Toaster.test.tsx 的 mock 手法）。
vi.mock('motion/react', async () => {
  const React = await import('react')
  const MockMotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
    const { animate, transition, initial, exit, ...rest } = props
    void transition
    void initial
    void exit
    return <div ref={ref} data-animate={JSON.stringify(animate)} {...rest} />
  })
  MockMotionDiv.displayName = 'MockMotionDiv'
  return { motion: { div: MockMotionDiv } }
})

// 依賴 useReducedMotion()，jsdom 預設沒有 matchMedia，需手動 stub（同 Dialog.test.tsx 的作法）。
function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      matches,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function ControlledPin({
  onComplete,
  autoComplete = 'current-password',
  error,
}: {
  onComplete?: (value: string) => void
  autoComplete?: 'current-password' | 'new-password'
  error?: boolean
}): ReactNode {
  const [value, setValue] = useState('')
  return (
    <NumericKeypad
      mode="pin"
      value={value}
      onChange={setValue}
      onComplete={onComplete}
      autoComplete={autoComplete}
      error={error}
    />
  )
}

function ControlledAmount({
  onComplete,
  onValue,
}: {
  onComplete?: (value: string) => void
  /** 觀察對外送出的金額（計算機測試用）。 */
  onValue?: (value: string) => void
}): ReactNode {
  const [value, setValue] = useState('')
  return (
    <>
      <NumericKeypad
        mode="amount"
        value={value}
        onChange={(next) => {
          setValue(next)
          onValue?.(next)
        }}
        onComplete={onComplete}
      />
      <button type="button" onClick={() => setValue('')}>
        重設
      </button>
    </>
  )
}

describe('NumericKeypad', () => {
  describe('mode="pin"', () => {
    it('預設 render 出可見的原生 input 與 3x4 鍵盤', () => {
      stubMatchMedia(false)
      render(<ControlledPin />)
      expect(screen.getByRole('group', { name: 'PIN 輸入' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '數字 5' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '刪除' })).toBeInTheDocument()
    })

    it('input 真實可見、非 readOnly（→ §5.2/§5.3 autofill 決議，2026-09-04）', () => {
      stubMatchMedia(false)
      render(<ControlledPin />)
      const input = screen.getByLabelText('PIN')
      expect(input).toBeVisible()
      expect(input).not.toHaveAttribute('readonly')
      expect(input).toHaveAttribute('type', 'password')
      expect(input).toHaveAttribute('inputmode', 'numeric')
    })

    it('autoComplete="current-password" 用於登入情境，正確傳遞到 input', () => {
      stubMatchMedia(false)
      render(<ControlledPin autoComplete="current-password" />)
      expect(screen.getByLabelText('PIN')).toHaveAttribute('autocomplete', 'current-password')
    })

    it('autoComplete="new-password" 用於設定/變更 PIN 情境，正確傳遞到 input', () => {
      stubMatchMedia(false)
      render(<ControlledPin autoComplete="new-password" />)
      expect(screen.getByLabelText('PIN')).toHaveAttribute('autocomplete', 'new-password')
    })

    it('點擊數字鍵輸入滿 6 碼時自動觸發 onComplete，不需要「完成」鍵', () => {
      stubMatchMedia(false)
      const onComplete = vi.fn()
      render(<ControlledPin onComplete={onComplete} />)
      for (const digit of ['1', '2', '3', '4', '5', '6']) {
        fireEvent.click(screen.getByRole('button', { name: `數字 ${digit}` }))
      }
      expect(onComplete).toHaveBeenCalledExactlyOnceWith('123456')
      expect(screen.queryByRole('button', { name: '完成' })).not.toBeInTheDocument()
    })

    it('未滿 6 碼時不觸發 onComplete', () => {
      stubMatchMedia(false)
      const onComplete = vi.fn()
      render(<ControlledPin onComplete={onComplete} />)
      for (const digit of ['1', '2', '3']) {
        fireEvent.click(screen.getByRole('button', { name: `數字 ${digit}` }))
      }
      expect(onComplete).not.toHaveBeenCalled()
      expect(screen.getByLabelText('PIN')).toHaveValue('123')
    })

    it('aria-live 進度只宣告位數，不朗讀實際數字', () => {
      stubMatchMedia(false)
      render(<ControlledPin />)
      fireEvent.click(screen.getByRole('button', { name: '數字 1' }))
      expect(screen.getByText('已輸入 1 位，共 6 位')).toBeInTheDocument()
    })

    it('長按刪除鍵清空全部輸入', () => {
      vi.useFakeTimers()
      stubMatchMedia(false)
      render(<ControlledPin />)
      fireEvent.click(screen.getByRole('button', { name: '數字 1' }))
      fireEvent.click(screen.getByRole('button', { name: '數字 2' }))
      expect(screen.getByLabelText('PIN')).toHaveValue('12')

      const backspace = screen.getByRole('button', { name: '刪除' })
      fireEvent.pointerDown(backspace)
      vi.advanceTimersByTime(600)
      fireEvent.pointerUp(backspace)
      expect(screen.getByLabelText('PIN')).toHaveValue('')
      vi.useRealTimers()
    })

    it('模擬密碼管理員 autofill（原生 input 事件）同步更新元件內部 state', () => {
      stubMatchMedia(false)
      render(<ControlledPin />)
      const input = screen.getByLabelText('PIN') as HTMLInputElement
      // 密碼管理員 autofill 不會經過自訂鍵盤按鈕，而是直接改 input 的原生 value 再 dispatch
      // 'input' event（→ §5.2 決議：無論輸入來源為何都走同一條 input change handler）。
      fireEvent.input(input, { target: { value: '998877' } })
      expect(input).toHaveValue('998877')
      expect(screen.getByText('已輸入 6 位，共 6 位')).toBeInTheDocument()
    })

    it('prefers-reduced-motion 關閉時，錯誤回饋走 shake 動畫、不顯示文字提示', () => {
      stubMatchMedia(false)
      render(<ControlledPin error />)
      const shakeContainer = screen.getByLabelText('PIN').parentElement
      expect(shakeContainer).toHaveAttribute('data-animate', JSON.stringify({ x: [0, -8, 8, -8, 8, 0] }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('prefers-reduced-motion 開啟時，錯誤回饋改為文字提示、不做位移動畫', () => {
      stubMatchMedia(true)
      render(<ControlledPin error />)
      const shakeContainer = screen.getByLabelText('PIN').parentElement
      expect(shakeContainer).toHaveAttribute('data-animate', JSON.stringify({ x: 0 }))
      expect(screen.getByRole('alert')).toHaveTextContent('PIN 錯誤')
    })

    it('disabled 時鍵盤按鍵停用', () => {
      stubMatchMedia(false)
      render(
        <NumericKeypad mode="pin" value="" onChange={() => {}} autoComplete="current-password" disabled />,
      )
      expect(screen.getByRole('button', { name: '數字 1' })).toBeDisabled()
      expect(screen.getByLabelText('PIN')).toBeDisabled()
    })
  })

  describe('mode="amount"', () => {
    it('input 維持 readOnly + inputMode="none"，不受 PIN autofill 決議影響', () => {
      stubMatchMedia(false)
      render(<ControlledAmount />)
      const input = screen.getByLabelText('金額')
      expect(input).toHaveAttribute('readonly')
      expect(input).toHaveAttribute('inputmode', 'none')
      expect(input).toHaveAttribute('type', 'text')
      expect(input).toHaveAttribute('autocomplete', 'off')
    })

    it('鍵盤含小數點鍵；有給 onComplete 時才顯示「完成」全寬按鍵', () => {
      stubMatchMedia(false)
      render(<ControlledAmount onComplete={vi.fn()} />)
      expect(screen.getByRole('button', { name: '小數點' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '完成' })).toBeInTheDocument()
    })

    it('沒給 onComplete（例：交易表單自己有儲存鈕）時不顯示「完成」鍵', () => {
      stubMatchMedia(false)
      render(<ControlledAmount />)
      expect(screen.queryByRole('button', { name: '完成' })).not.toBeInTheDocument()
    })

    it('輸入數字後不會自動送出，需點擊「完成」才觸發 onComplete', () => {
      stubMatchMedia(false)
      const onComplete = vi.fn()
      render(<ControlledAmount onComplete={onComplete} />)
      fireEvent.click(screen.getByRole('button', { name: '數字 1' }))
      fireEvent.click(screen.getByRole('button', { name: '數字 2' }))
      fireEvent.click(screen.getByRole('button', { name: '小數點' }))
      fireEvent.click(screen.getByRole('button', { name: '數字 5' }))
      expect(onComplete).not.toHaveBeenCalled()
      expect(screen.getByLabelText('金額')).toHaveValue('12.5')

      fireEvent.click(screen.getByRole('button', { name: '完成' }))
      expect(onComplete).toHaveBeenCalledExactlyOnceWith('12.5')
    })

    it('小數點只能輸入一次', () => {
      stubMatchMedia(false)
      render(<ControlledAmount />)
      fireEvent.click(screen.getByRole('button', { name: '數字 1' }))
      fireEvent.click(screen.getByRole('button', { name: '小數點' }))
      fireEvent.click(screen.getByRole('button', { name: '小數點' }))
      fireEvent.click(screen.getByRole('button', { name: '數字 5' }))
      expect(screen.getByLabelText('金額')).toHaveValue('1.5')
    })

    it('刪除鍵可逐位刪除', () => {
      stubMatchMedia(false)
      render(<ControlledAmount />)
      fireEvent.click(screen.getByRole('button', { name: '數字 1' }))
      fireEvent.click(screen.getByRole('button', { name: '數字 2' }))
      fireEvent.click(screen.getByRole('button', { name: '刪除' }))
      expect(screen.getByLabelText('金額')).toHaveValue('1')
    })

    it('空值時「完成」鍵停用（邊界情境）', () => {
      stubMatchMedia(false)
      render(<ControlledAmount onComplete={vi.fn()} />)
      expect(screen.getByRole('button', { name: '完成' })).toBeDisabled()
    })
  })

  // 2026-09-29 使用者要求：記帳時可以直接在金額鍵盤上算「120+35」。輸入框顯示算式，
  // 對外的 value 永遠是算好的金額。
  describe('mode="amount" 計算機', () => {
    function click(name: string): void {
      fireEvent.click(screen.getByRole('button', { name }))
    }

    function typeDigits(digits: string): void {
      for (const digit of digits) click(`數字 ${digit}`)
    }

    it('120 + 35：輸入框顯示算式、下方預覽 = 155、onChange 收到 155', () => {
      stubMatchMedia(false)
      const onValue = vi.fn()
      render(<ControlledAmount onValue={onValue} />)
      typeDigits('120')
      click('加')
      typeDigits('35')
      expect(screen.getByLabelText('金額')).toHaveValue('120+35')
      expect(screen.getByText('= 155')).toBeInTheDocument()
      expect(onValue).toHaveBeenLastCalledWith('155')
    })

    it('先乘除後加減：2 + 3 × 4 = 14', () => {
      stubMatchMedia(false)
      const onValue = vi.fn()
      render(<ControlledAmount onValue={onValue} />)
      typeDigits('2')
      click('加')
      typeDigits('3')
      click('乘')
      typeDigits('4')
      expect(onValue).toHaveBeenLastCalledWith('14')
    })

    it('按「=」把算式收斂成結果，「=」鍵隨之消失', () => {
      stubMatchMedia(false)
      render(<ControlledAmount />)
      typeDigits('120')
      click('加')
      typeDigits('35')
      click('等於')
      expect(screen.getByLabelText('金額')).toHaveValue('155')
      expect(screen.queryByRole('button', { name: '等於' })).not.toBeInTheDocument()
    })

    it('算式結尾多一個運算子時，以前面算好的值送出；連按運算子取後者', () => {
      stubMatchMedia(false)
      const onValue = vi.fn()
      render(<ControlledAmount onValue={onValue} />)
      typeDigits('12')
      click('加')
      expect(onValue).toHaveBeenLastCalledWith('12')
      click('乘')
      expect(screen.getByLabelText('金額')).toHaveValue('12×')
    })

    it('小數點以目前正在輸入的數字為準：1.5 + 2.5 = 4', () => {
      stubMatchMedia(false)
      const onValue = vi.fn()
      render(<ControlledAmount onValue={onValue} />)
      typeDigits('1')
      click('小數點')
      typeDigits('5')
      click('加')
      typeDigits('2')
      click('小數點')
      typeDigits('5')
      expect(screen.getByLabelText('金額')).toHaveValue('1.5+2.5')
      expect(onValue).toHaveBeenLastCalledWith('4')
    })

    it('除以 0 或算出非正數時預覽顯示 —、onChange 收到空字串（交由表單驗證擋下）', () => {
      stubMatchMedia(false)
      const onValue = vi.fn()
      render(<ControlledAmount onValue={onValue} />)
      typeDigits('5')
      click('除')
      typeDigits('0')
      expect(screen.getByText('= —')).toBeInTheDocument()
      expect(onValue).toHaveBeenLastCalledWith('')
      expect(screen.getByRole('button', { name: '等於' })).toBeDisabled()
    })

    it('刪除鍵刪掉運算子後回到純數字', () => {
      stubMatchMedia(false)
      const onValue = vi.fn()
      render(<ControlledAmount onValue={onValue} />)
      typeDigits('12')
      click('加')
      click('刪除')
      expect(screen.getByLabelText('金額')).toHaveValue('12')
      expect(onValue).toHaveBeenLastCalledWith('12')
    })

    it('父層把 value 清空（表單 reset）時，算式也一起清空', () => {
      stubMatchMedia(false)
      render(<ControlledAmount />)
      typeDigits('12')
      click('加')
      typeDigits('3')
      fireEvent.click(screen.getByRole('button', { name: '重設' }))
      expect(screen.getByLabelText('金額')).toHaveValue('')
      expect(screen.queryByRole('button', { name: '等於' })).not.toBeInTheDocument()
    })
  })
})
