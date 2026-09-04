'use client'

import type { ChangeEvent, CSSProperties, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface NumericKeypadCommonProps {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  id?: string
  name?: string
  className?: string
}

export interface PinNumericKeypadProps extends NumericKeypadCommonProps {
  mode: 'pin'
  /**
   * 登入情境（`POST /auth/login/pin`）用 `current-password`（帶入既有憑證）；
   * 設定/變更 PIN 情境（`POST|PATCH /auth/pin`）用 `new-password`（避免瀏覽器誤存/誤填舊 PIN）。
   * → design-spec.md §5.3。
   */
  autoComplete: 'current-password' | 'new-password'
  /** 由呼叫端在驗證失敗時翻為 true 觸發一次錯誤回饋（shake / 文字提示），清空重來由呼叫端一併重設 value。 */
  error?: boolean
}

export interface AmountNumericKeypadProps extends NumericKeypadCommonProps {
  mode: 'amount'
}

export type NumericKeypadProps = PinNumericKeypadProps | AmountNumericKeypadProps

type DigitKey = { kind: 'digit'; digit: string }
type KeypadKey = DigitKey | { kind: 'blank' } | { kind: 'backspace' } | { kind: 'decimal' }

const PIN_DIGIT_ROWS: KeypadKey[][] = [
  [{ kind: 'digit', digit: '1' }, { kind: 'digit', digit: '2' }, { kind: 'digit', digit: '3' }],
  [{ kind: 'digit', digit: '4' }, { kind: 'digit', digit: '5' }, { kind: 'digit', digit: '6' }],
  [{ kind: 'digit', digit: '7' }, { kind: 'digit', digit: '8' }, { kind: 'digit', digit: '9' }],
  [{ kind: 'blank' }, { kind: 'digit', digit: '0' }, { kind: 'backspace' }],
]

const AMOUNT_DIGIT_ROWS: KeypadKey[][] = [
  [{ kind: 'digit', digit: '1' }, { kind: 'digit', digit: '2' }, { kind: 'digit', digit: '3' }],
  [{ kind: 'digit', digit: '4' }, { kind: 'digit', digit: '5' }, { kind: 'digit', digit: '6' }],
  [{ kind: 'digit', digit: '7' }, { kind: 'digit', digit: '8' }, { kind: 'digit', digit: '9' }],
  [{ kind: 'decimal' }, { kind: 'digit', digit: '0' }, { kind: 'backspace' }],
]

const LONG_PRESS_MS = 500

const KEY_BUTTON_CLASS =
  'min-h-[44px] min-w-[44px] rounded-md border border-border bg-surface text-xl font-medium text-text-primary ' +
  'transition-[transform,background-color] duration-100 ease-out active:scale-95 active:bg-primary-100 ' +
  'motion-reduce:active:scale-100 disabled:opacity-50 disabled:pointer-events-none'

// `-webkit-text-security` 非標準 CSS 屬性，`CSSProperties` 型別未收錄，用擴充 interface
// 承載（禁 `any`），讓瀏覽器原生把每個字元畫成圓點（→ design-spec.md §5.2，2026-09-04 決議：
// 圓點列即為這顆原生 <input> 本身，不疊裝飾用圓點 div）。
interface PinInputStyle extends CSSProperties {
  WebkitTextSecurity?: 'disc'
}

const PIN_INPUT_STYLE: PinInputStyle = {
  WebkitTextSecurity: 'disc',
  letterSpacing: '0.5em',
}

/**
 * 用原生 setter 寫入 input.value 後 dispatch 'input' event，取代直接呼叫 onChange：
 * 讓「點擊自訂鍵盤」與「瀏覽器/密碼管理員 autofill」都走同一條路徑（input 的原生 change
 * handler），React state 才能與兩種輸入來源都同步（→ design-spec.md §5.2/§5.4，2026-09-04 決議）。
 */
function writeNativeInputValue(input: HTMLInputElement, next: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, next)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * 客製化數字鍵盤（`→ FE-048` 必走共用；design-spec.md §5 全節）。
 *
 * `mode="pin"`：底層 `<input type="password">` 真實可見、非 `readOnly`，用 `-webkit-text-security`
 * 呈現圓點視覺，以支援瀏覽器/系統密碼管理員 autofill（2026-09-04 決議）。這與「完全抑制原生數字
 * 鍵盤彈出」互斥——`inputMode="numeric"` 只是嘗試抑制，部分 Android/iOS 版本仍可能彈出系統鍵盤，
 * 這是拿到 autofill 的必要代價，不是 bug（→ §5.4）。滿 6 碼自動送出（`onComplete`）。
 *
 * `mode="amount"`：不受上述決議影響，維持 `readOnly` + `inputMode="none"`（無 autofill 需求，
 * 也就没有「可見性」與「抑制鍵盤」互斥的張力），按「完成」才送出。
 */
export function NumericKeypad(props: NumericKeypadProps): ReactNode {
  const { value, onChange, onComplete, disabled = false, id, name, className } = props
  const mode = props.mode
  const error = props.mode === 'pin' ? (props.error ?? false) : false

  const generatedId = useId()
  const inputId = id ?? generatedId
  const inputRef = useRef<HTMLInputElement>(null)
  const reducedMotion = useReducedMotion()

  // 用 ref 存最新 onComplete，避免把它放進下方 effect 的 deps（呼叫端多半傳 inline 函式，
  // 參考身分每次 render 都變，放進 deps 會導致值沒變也重跑）。
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  })

  useEffect(() => {
    if (mode !== 'pin') return
    if (value.length === 6) {
      onCompleteRef.current?.(value)
    }
  }, [mode, value])

  // 錯誤觸發一次 shake（或 reduced-motion 時的文字提示）：用 shakeKey 遞增 + motion.div 的
  // `key` 讓同一個 error=true 狀態下每次「由 false 翻為 true」都能重播一次動畫。
  const [shakeKey, setShakeKey] = useState(0)
  const prevErrorRef = useRef(false)
  useEffect(() => {
    if (mode !== 'pin') return
    if (error && !prevErrorRef.current) {
      setShakeKey((key) => key + 1)
    }
    prevErrorRef.current = error
  }, [mode, error])

  function handlePinInputChange(event: ChangeEvent<HTMLInputElement>): void {
    if (disabled) return
    const digitsOnly = event.target.value.replace(/\D/g, '').slice(0, 6)
    onChange(digitsOnly)
  }

  function handleDigitClick(digit: string): void {
    if (disabled) return
    if (mode === 'pin') {
      if (value.length >= 6) return
      const input = inputRef.current
      if (input === null) {
        onChange((value + digit).slice(0, 6))
        return
      }
      writeNativeInputValue(input, value + digit)
    } else {
      onChange(value + digit)
    }
  }

  function handleDecimalClick(): void {
    if (disabled || mode !== 'amount') return
    if (value.includes('.')) return
    onChange(value === '' ? '0.' : `${value}.`)
  }

  function deleteLast(): void {
    if (disabled) return
    const next = value.slice(0, -1)
    if (mode === 'pin') {
      const input = inputRef.current
      if (input === null) {
        onChange(next)
        return
      }
      writeNativeInputValue(input, next)
    } else {
      onChange(next)
    }
  }

  function clearAll(): void {
    if (disabled) return
    if (mode === 'pin') {
      const input = inputRef.current
      if (input === null) {
        onChange('')
        return
      }
      writeNativeInputValue(input, '')
    } else {
      onChange('')
    }
  }

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  function handleBackspacePointerDown(): void {
    if (disabled) return
    longPressTriggeredRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true
      clearAll()
    }, LONG_PRESS_MS)
  }

  function handleBackspacePointerUp(): void {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function handleBackspaceClick(): void {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      return
    }
    deleteLast()
  }

  function handleCompleteClick(): void {
    if (disabled || mode !== 'amount') return
    onComplete?.(value)
  }

  function renderKey(key: KeypadKey, rowIndex: number, colIndex: number): ReactNode {
    const cellKey = `${rowIndex}-${colIndex}`
    if (key.kind === 'blank') {
      return <span key={cellKey} aria-hidden="true" className="min-h-[44px] min-w-[44px]" />
    }
    if (key.kind === 'digit') {
      return (
        <button
          key={cellKey}
          type="button"
          aria-label={`數字 ${key.digit}`}
          className={KEY_BUTTON_CLASS}
          disabled={disabled}
          onClick={() => handleDigitClick(key.digit)}
        >
          {key.digit}
        </button>
      )
    }
    if (key.kind === 'decimal') {
      return (
        <button
          key={cellKey}
          type="button"
          aria-label="小數點"
          className={KEY_BUTTON_CLASS}
          disabled={disabled}
          onClick={handleDecimalClick}
        >
          .
        </button>
      )
    }
    return (
      <button
        key={cellKey}
        type="button"
        aria-label="刪除"
        className={KEY_BUTTON_CLASS}
        disabled={disabled}
        onClick={handleBackspaceClick}
        onPointerDown={handleBackspacePointerDown}
        onPointerLeave={handleBackspacePointerUp}
        onPointerUp={handleBackspacePointerUp}
      >
        ⌫
      </button>
    )
  }

  if (props.mode === 'pin') {
    return (
      <div
        role="group"
        aria-label="PIN 輸入"
        className={`flex flex-col gap-4 [padding-bottom:env(safe-area-inset-bottom)] ${className ?? ''}`}
      >
        <motion.div
          key={shakeKey}
          className="flex justify-center"
          animate={!reducedMotion && error ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        >
          <input
            ref={inputRef}
            id={inputId}
            name={name}
            type="password"
            inputMode="numeric"
            pattern="\d*"
            maxLength={6}
            autoComplete={props.autoComplete}
            aria-label="PIN"
            disabled={disabled}
            value={value}
            onChange={handlePinInputChange}
            style={PIN_INPUT_STYLE}
            className="w-40 rounded-md border border-border bg-surface px-4 py-3 text-center text-2xl text-text-primary"
          />
        </motion.div>
        <div aria-live="polite" className="sr-only">
          {`已輸入 ${value.length} 位，共 6 位`}
        </div>
        {error && reducedMotion && (
          <p role="alert" className="text-center text-sm text-danger-500">
            PIN 錯誤
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {PIN_DIGIT_ROWS.flatMap((row, rowIndex) => row.map((key, colIndex) => renderKey(key, rowIndex, colIndex)))}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-2 [padding-bottom:env(safe-area-inset-bottom)] ${className ?? ''}`}>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="text"
        inputMode="none"
        autoComplete="off"
        readOnly
        aria-label="金額"
        disabled={disabled}
        value={value}
        className="w-full rounded-md border border-border bg-surface px-4 py-3 text-right text-2xl text-text-primary"
      />
      <div className="grid grid-cols-3 gap-2">
        {AMOUNT_DIGIT_ROWS.flatMap((row, rowIndex) => row.map((key, colIndex) => renderKey(key, rowIndex, colIndex)))}
      </div>
      <button
        type="button"
        aria-label="完成"
        disabled={disabled || value.length === 0}
        onClick={handleCompleteClick}
        className="min-h-[44px] w-full rounded-md bg-primary-600 text-base font-semibold text-white transition-transform active:scale-95 motion-reduce:active:scale-100 disabled:opacity-50"
      >
        完成
      </button>
    </div>
  )
}
