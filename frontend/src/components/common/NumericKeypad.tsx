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

// 計算機用的四則運算子：顯示用全形符號，避免「−」被誤認成負號、「×」被誤認成字母 x。
const OPERATORS = ['+', '−', '×', '÷'] as const
type Operator = (typeof OPERATORS)[number]
const OPERATOR_LABEL: Record<Operator, string> = { '+': '加', '−': '減', '×': '乘', '÷': '除' }
const OPERATOR_PATTERN = /[+−×÷]/

type DigitKey = { kind: 'digit'; digit: string }
type KeypadKey =
  | DigitKey
  | { kind: 'blank' }
  | { kind: 'backspace' }
  | { kind: 'decimal' }
  | { kind: 'operator'; operator: Operator }

const PIN_DIGIT_ROWS: KeypadKey[][] = [
  [{ kind: 'digit', digit: '1' }, { kind: 'digit', digit: '2' }, { kind: 'digit', digit: '3' }],
  [{ kind: 'digit', digit: '4' }, { kind: 'digit', digit: '5' }, { kind: 'digit', digit: '6' }],
  [{ kind: 'digit', digit: '7' }, { kind: 'digit', digit: '8' }, { kind: 'digit', digit: '9' }],
  [{ kind: 'blank' }, { kind: 'digit', digit: '0' }, { kind: 'backspace' }],
]

// 金額鍵盤多一欄運算子（÷ × − +），記帳時可以直接算「120+35」（2026-09-29 使用者要求）。
const AMOUNT_DIGIT_ROWS: KeypadKey[][] = [
  [{ kind: 'digit', digit: '1' }, { kind: 'digit', digit: '2' }, { kind: 'digit', digit: '3' }, { kind: 'operator', operator: '÷' }],
  [{ kind: 'digit', digit: '4' }, { kind: 'digit', digit: '5' }, { kind: 'digit', digit: '6' }, { kind: 'operator', operator: '×' }],
  [{ kind: 'digit', digit: '7' }, { kind: 'digit', digit: '8' }, { kind: 'digit', digit: '9' }, { kind: 'operator', operator: '−' }],
  [{ kind: 'decimal' }, { kind: 'digit', digit: '0' }, { kind: 'backspace' }, { kind: 'operator', operator: '+' }],
]

const LONG_PRESS_MS = 500

function isOperator(ch: string): ch is Operator {
  return (OPERATORS as readonly string[]).includes(ch)
}

function hasOperator(expr: string): boolean {
  return OPERATOR_PATTERN.test(expr)
}

/** 目前正在輸入的那個數字（最後一個運算子之後的部分）。 */
function currentNumber(expr: string): string {
  const parts = expr.split(OPERATOR_PATTERN)
  return parts[parts.length - 1] ?? ''
}

function formatResult(n: number): string {
  // 金額最多兩位小數，去掉尾端多餘的 0（15.50 → 15.5、16.00 → 16）
  return n.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * 計算「120+35×2」這類算式，先乘除後加減。結尾多一個運算子（「120+」）視為還沒輸入下一個數，
 * 忽略它。結果不是正的有限數（除以 0、算出負數）回空字串，讓表單的「請輸入金額」驗證接手。
 */
export function evaluateAmountExpression(expr: string): string {
  const tokens = expr.match(/[0-9.]+|[+−×÷]/g) ?? []
  const last = tokens[tokens.length - 1]
  if (last !== undefined && isOperator(last)) tokens.pop()
  if (tokens.length === 0) return ''

  // 第一趟：把乘除先算掉，留下只有加減的序列
  const reduced: (number | Operator)[] = []
  for (const token of tokens) {
    if (isOperator(token)) {
      reduced.push(token)
      continue
    }
    const n = Number(token)
    const op = reduced[reduced.length - 1]
    if (op === '×' || op === '÷') {
      reduced.pop()
      const left = reduced.pop()
      if (typeof left !== 'number') return ''
      reduced.push(op === '×' ? left * n : left / n)
    } else {
      reduced.push(n)
    }
  }

  // 第二趟：由左到右加減
  let total = 0
  let sign = 1
  let first = true
  for (const item of reduced) {
    if (typeof item === 'number') {
      total = first ? item : total + sign * item
      first = false
    } else {
      sign = item === '−' ? -1 : 1
    }
  }
  if (!Number.isFinite(total) || total <= 0) return ''
  return formatResult(total)
}

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
 * 也就没有「可見性」與「抑制鍵盤」互斥的張力）。內建計算機：輸入框顯示的是算式（「120+35」），
 * 對外的 `value` 永遠是算好的金額（「155」），有運算子時下方即時預覽結果、按「=」把算式收斂成
 * 結果。「完成」鍵只在呼叫端有給 `onComplete` 時才顯示（表單內另有儲存鈕，重複顯示只會混淆）。
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

  // 計算機（mode="amount"）：expr 是使用者看到的算式，emitted 是上次送給父層的金額。父層從外部
  // 改 value（表單 reset、編輯模式預帶）時，用「render 期間比對」把 expr 同步回來（同
  // ColorSwatchPicker.tsx 的 React 官方建議寫法，不在 useEffect 內 setState）。
  const [expr, setExpr] = useState(value)
  const [emitted, setEmitted] = useState(value)
  if (mode === 'amount' && value !== emitted) {
    setExpr(value)
    setEmitted(value)
  }

  function applyExpr(next: string): void {
    const out = hasOperator(next) ? evaluateAmountExpression(next) : next
    setExpr(next)
    setEmitted(out)
    onChange(out)
  }

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
      applyExpr(expr + digit)
    }
  }

  function handleDecimalClick(): void {
    if (disabled || mode !== 'amount') return
    const current = currentNumber(expr)
    if (current.includes('.')) return
    applyExpr(current === '' ? `${expr}0.` : `${expr}.`)
  }

  function handleOperatorClick(operator: Operator): void {
    if (disabled || mode !== 'amount' || expr === '') return
    const last = expr[expr.length - 1] ?? ''
    // 連按兩個運算子視為改用後者
    applyExpr(isOperator(last) ? expr.slice(0, -1) + operator : expr + operator)
  }

  function handleEqualsClick(): void {
    if (disabled || mode !== 'amount' || !hasOperator(expr)) return
    const result = evaluateAmountExpression(expr)
    if (result === '') return
    applyExpr(result)
  }

  function deleteLast(): void {
    if (disabled) return
    if (mode === 'pin') {
      const next = value.slice(0, -1)
      const input = inputRef.current
      if (input === null) {
        onChange(next)
        return
      }
      writeNativeInputValue(input, next)
    } else {
      applyExpr(expr.slice(0, -1))
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
      applyExpr('')
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
    if (key.kind === 'operator') {
      return (
        <button
          key={cellKey}
          type="button"
          aria-label={OPERATOR_LABEL[key.operator]}
          className={`${KEY_BUTTON_CLASS} bg-primary-100 text-primary-700`}
          disabled={disabled}
          onClick={() => handleOperatorClick(key.operator)}
        >
          {key.operator}
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

  const exprHasOperator = hasOperator(expr)
  const preview = exprHasOperator ? evaluateAmountExpression(expr) : ''

  return (
    // 金額模式只用在 <Dialog> 內，safe-area 由 Dialog 的底部 padding 處理，這裡不再自己加（避免疊加兩次）
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
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
        value={expr}
        className="w-full rounded-md border border-border bg-surface px-4 py-3 text-right text-2xl text-text-primary"
      />
      {exprHasOperator && (
        <p aria-live="polite" className="text-right text-base text-text-secondary">
          = {preview === '' ? '—' : preview}
        </p>
      )}
      <div className="grid grid-cols-4 gap-2">
        {AMOUNT_DIGIT_ROWS.flatMap((row, rowIndex) => row.map((key, colIndex) => renderKey(key, rowIndex, colIndex)))}
      </div>
      {exprHasOperator && (
        <button
          type="button"
          aria-label="等於"
          disabled={disabled || preview === ''}
          onClick={handleEqualsClick}
          className="min-h-[44px] w-full rounded-md border border-primary-500 bg-primary-100 text-xl font-semibold text-primary-700 transition-transform active:scale-95 motion-reduce:active:scale-100 disabled:opacity-50"
        >
          =
        </button>
      )}
      {onComplete && (
        <button
          type="button"
          aria-label="完成"
          disabled={disabled || value.length === 0}
          onClick={handleCompleteClick}
          className="min-h-[44px] w-full rounded-md bg-primary-600 text-base font-semibold text-white transition-transform active:scale-95 motion-reduce:active:scale-100 disabled:opacity-50"
        >
          完成
        </button>
      )}
    </div>
  )
}
