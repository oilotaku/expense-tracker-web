'use client'

import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog } from '@/components/common/Dialog'
import { NumericKeypad } from '@/components/common/NumericKeypad'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import {
  useListAccountOptionsQuery,
  useListCategoryOptionsQuery,
  type NonTransferType,
} from '@/lib/api/transactionsApi'
import {
  RecurringFieldset,
  type RecurringFieldsetValue,
  type RecurringIntervalUnit,
} from './RecurringFieldset'

// 顯示時區固定 Asia/Taipei（→ CORE-041，同 TransactionForm.tsx 既有慣例的相同理由）：
// FE-043 要求的 utils/datetime.ts `toLocalInput` / `fromLocalInput` 尚未落地，該檔不在本 task
// 的 affected_files 內、不可新增匯出，故在此元件內部就地實作等價轉換，僅供本表單使用。
const API_TZ_OFFSET = '+08:00'

// 「帳戶預設值記住新選擇」（→ A11 同機制，localStorage）：此偏好只有本元件單一處讀寫（不像
// useChartPreference 需要跨元件即時同步 UI），故不抽成 hooks/useXxx.ts（該目錄也不在本 task
// affected_files 內、不可新增檔案）；FE-044「被 ≥2 處使用才抽共用檔」在此不成立。
const DEFAULT_ACCOUNT_STORAGE_KEY = 'default-account-uid'
const DEFAULT_CATEGORY_NAME = '其他'
const DEFAULT_ACCOUNT_NAME = '現金'

const PAYMENT_METHOD_OPTIONS = ['現金', '信用卡', '金融卡', '行動支付', '銀行轉帳', '其他'] as const

const AMOUNT_PATTERN = /^\d+(\.\d*)?$/

function readRememberedAccountUid(): string | null {
  try {
    return window.localStorage.getItem(DEFAULT_ACCOUNT_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeRememberedAccountUid(accountUid: string): void {
  if (!accountUid) return
  try {
    window.localStorage.setItem(DEFAULT_ACCOUNT_STORAGE_KEY, accountUid)
  } catch {
    // 私密瀏覽模式等場景寫入失敗時降級為「不記住」，不影響本次表單操作本身。
  }
}

function todayDateInput(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${p.year}-${p.month}-${p.day}`
}

// value 是 <input type="date"> 的無時間牆鐘字串，視為 Asia/Taipei 當地日期的午夜（§7.1 已把
// 「日期時間」簡化為單純「日期」，時間分量非本表單使用者可見欄位）。
function dateInputToApiDatetime(dateValue: string): string {
  return `${dateValue}T00:00:00${API_TZ_OFFSET}`
}

// initialValues.transactionDate 可能是完整 ISO datetime（編輯既有交易）或純日期字串，
// 統一取 'T' 前段供 <input type="date"> 使用。
function extractDateInput(value: string): string {
  const tIndex = value.indexOf('T')
  return tIndex >= 0 ? value.slice(0, tIndex) : value
}

function defaultRecurringValue(): RecurringFieldsetValue {
  return { intervalUnit: 'month', intervalCount: 1, anchorDate: todayDateInput() }
}

const transactionFormSchema = z
  .object({
    transactionType: z.string().min(1, '請選擇收支類型'),
    transactionDate: z.string().min(1, '請選擇日期'),
    amount: z
      .string()
      .min(1, '請輸入金額')
      .refine((v) => AMOUNT_PATTERN.test(v) && Number(v) > 0, '金額需大於 0'),
    categoryUid: z.string(),
    description: z.string(),
    // 收入/支出時是「帳戶」；轉帳時是「轉出帳戶」（→ toAccountUid 才是「轉入帳戶」）。
    accountUid: z.string().min(1, '請選擇帳戶'),
    // 只有轉帳（transactionType === 'transfer'）用得到，見下方 superRefine。
    toAccountUid: z.string(),
    paymentMethod: z.string(),
    isRecurring: z.boolean(),
    recurring: z.object({
      intervalUnit: z.enum(['week', 'month', 'year']),
      intervalCount: z.number(),
      anchorDate: z.string(),
    }),
  })
  .superRefine((values, ctx) => {
    if (values.transactionType === 'transfer') {
      if (values.toAccountUid.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['toAccountUid'], message: '請選擇轉入帳戶' })
      } else if (values.toAccountUid === values.accountUid) {
        ctx.addIssue({ code: 'custom', path: ['toAccountUid'], message: '轉出與轉入帳戶不可相同' })
      }
      return
    }
    if (!values.isRecurring) return
    if (values.recurring.intervalCount < 1 || values.recurring.intervalCount > 99) {
      ctx.addIssue({ code: 'custom', path: ['recurring', 'intervalCount'], message: '間隔需為 1–99' })
    }
    if (values.recurring.anchorDate.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['recurring', 'anchorDate'], message: '請選擇起算日' })
    }
  })

type FormInput = z.infer<typeof transactionFormSchema>

function defaultFormInput(): FormInput {
  return {
    transactionType: '',
    transactionDate: todayDateInput(),
    amount: '',
    categoryUid: '',
    description: '',
    accountUid: '',
    toAccountUid: '',
    paymentMethod: '',
    isRecurring: false,
    recurring: defaultRecurringValue(),
  }
}

export interface TransactionFormRecurringValues {
  interval_unit: RecurringIntervalUnit
  interval_count: number
  anchor_date: string
}

// 與 `TransactionCreateRequest`（`frontend/src/lib/api/transactionsApi.ts`）欄位同名同型別，
// 呼叫端可直接把 recurring 以外的欄位原樣傳給 `createTransaction`。
export interface TransactionFormNonTransferValues {
  transaction_type: NonTransferType
  transaction_date: string
  amount: string
  category_uid: string
  description: string
  account_uid: string
  payment_method: string
  tags: string[]
  recurring: TransactionFormRecurringValues | null
}

// 轉帳沒有分類/標籤/固定收支（→ 明確排除範圍，見 propose），欄位對齊
// `TransferCreateRequest`（少了 tags/recurring，多了 from/to 兩個帳戶）。
export interface TransactionFormTransferValues {
  transaction_type: 'transfer'
  transaction_date: string
  amount: string
  description: string
  from_account_uid: string
  to_account_uid: string
  payment_method: string
}

// 用 transaction_type 判別式聯集：呼叫端 `if (values.transaction_type === 'transfer')` 就能讓
// TypeScript 正確窄化出 from_account_uid/to_account_uid vs category_uid/account_uid/recurring。
export type TransactionFormValues = TransactionFormNonTransferValues | TransactionFormTransferValues

export interface TransactionFormNonTransferInitialValues {
  transaction_type: NonTransferType
  transaction_date: string
  amount: string
  category_uid: string
  description: string
  account_uid: string
  payment_method: string
  recurring: TransactionFormRecurringValues | null
}

export type TransactionFormInitialValues =
  | TransactionFormNonTransferInitialValues
  | TransactionFormTransferValues

export interface TransactionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 預設 'create'；'edit' 需搭配 `initialValues` 預帶既有值（→ design-spec.md §9.3/§9.4） */
  mode?: 'create' | 'edit'
  initialValues?: TransactionFormInitialValues
  /**
   * 表單驗證通過後呼叫，由呼叫端決定實際 API 呼叫（`createTransaction` / 未來的 update /
   * `createRecurringRule`，→ A13）。本元件刻意不直接依賴任何 RTK Query mutation：
   * `frontend/src/lib/api/transactionsApi.ts` 尚無 update mutation、
   * `frontend/src/lib/api/recurringApi.ts` 的型別仍是舊版 `day_of_month`（由 task-022 更新），
   * 兩者皆不在本 task 的 affected_files 內，寫死呼叫會在型別或執行期對不上。
   */
  onSubmit: (values: TransactionFormValues) => Promise<void> | void
}

/**
 * 新增/編輯交易（`→ design-spec.md §7` / §9.3 / §9.4）：桌機 `<Dialog>` 置中卡、行動端
 * BottomSheet（同一顆 `<Dialog>`，task-008），表單初始只顯示收支類型／日期／金額三必填 +
 * 「更多欄位」展開（行動端摺疊、桌機預設展開）。留白時分類補「其他」、明細/支付方式送空字串
 * （`→ A5`）；金額用 `<NumericKeypad mode="amount">`；固定收支勾選展開 `<RecurringFieldset>`。
 */
export function TransactionFormDialog({
  open,
  onOpenChange,
  mode = 'create',
  initialValues,
  onSubmit,
}: TransactionFormDialogProps): ReactNode {
  const { data: accounts } = useListAccountOptionsQuery()
  const { data: categories } = useListCategoryOptionsQuery()

  const isDesktop = useBreakpoint('md')
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const showMoreFields = isDesktop || mobileMoreOpen

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 依 React 文件建議的「render 期間依 prop 變化調整 state」寫法（非 useEffect 內同步
  // setState），同 ColorSwatchPicker.tsx 既有慣例：對話框從關閉變為開啟時清空上次的送出錯誤。
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSubmitError(null)
  }

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormInput>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: defaultFormInput(),
  })

  // useWatch（而非 watch()）：react-hook-form 的 `watch()` 回傳的函式無法被 React Compiler
  // 安全地記憶化（會跳過 memoization），改用 `useWatch` 這個 render-safe 的訂閱 hook。
  const isRecurringChecked = useWatch({ control, name: 'isRecurring' })
  const transactionType = useWatch({ control, name: 'transactionType' })
  const isTransfer = transactionType === 'transfer'

  const defaultCategoryUid = useMemo(
    () => categories?.find((category) => category.name === DEFAULT_CATEGORY_NAME)?.category_uid ?? '',
    [categories],
  )

  // 對話框每次開啟時重置表單：create 模式回到空白預設值、edit 模式預帶 initialValues。
  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initialValues) {
      if (initialValues.transaction_type === 'transfer') {
        // 轉帳沒有分類/固定收支欄位；該列自己是哪個方向（OUT/IN）由呼叫端
        // （→ TransactionList.tsx）解析好，統一還原成「轉出帳戶＝該列自己的帳戶」。
        reset({
          ...defaultFormInput(),
          transactionType: 'transfer',
          transactionDate: extractDateInput(initialValues.transaction_date),
          amount: initialValues.amount,
          description: initialValues.description,
          accountUid: initialValues.from_account_uid,
          toAccountUid: initialValues.to_account_uid,
          paymentMethod: initialValues.payment_method,
        })
        return
      }
      reset({
        transactionType: initialValues.transaction_type,
        transactionDate: extractDateInput(initialValues.transaction_date),
        amount: initialValues.amount,
        categoryUid: initialValues.category_uid,
        description: initialValues.description,
        accountUid: initialValues.account_uid,
        toAccountUid: '',
        paymentMethod: initialValues.payment_method,
        isRecurring: initialValues.recurring !== null,
        recurring: initialValues.recurring
          ? {
              intervalUnit: initialValues.recurring.interval_unit,
              intervalCount: initialValues.recurring.interval_count,
              anchorDate: initialValues.recurring.anchor_date,
            }
          : defaultRecurringValue(),
      })
    } else {
      reset(defaultFormInput())
    }
  }, [open, mode, initialValues, reset])

  // create 模式的帳戶預設值：記住的上次選擇 → 否則「現金」→ 否則清單第一筆（→ A11 同機制）。
  useEffect(() => {
    if (!open || mode !== 'create') return
    if (!accounts || accounts.length === 0) return
    if (getValues('accountUid')) return
    const rememberedUid = readRememberedAccountUid()
    const remembered = rememberedUid
      ? accounts.find((account) => account.account_uid === rememberedUid)
      : undefined
    const cash = accounts.find((account) => account.name === DEFAULT_ACCOUNT_NAME)
    const resolved = remembered ?? cash ?? accounts[0]
    if (resolved) setValue('accountUid', resolved.account_uid)
  }, [open, mode, accounts, getValues, setValue])

  function handleAccountUidChange(event: ChangeEvent<HTMLSelectElement>): void {
    writeRememberedAccountUid(event.target.value)
  }

  async function handleValidSubmit(data: FormInput): Promise<void> {
    const payload: TransactionFormValues =
      data.transactionType === 'transfer'
        ? {
            transaction_type: 'transfer',
            transaction_date: dateInputToApiDatetime(data.transactionDate),
            amount: data.amount,
            description: data.description,
            from_account_uid: data.accountUid,
            to_account_uid: data.toAccountUid,
            payment_method: data.paymentMethod,
          }
        : {
            transaction_type: data.transactionType as NonTransferType,
            transaction_date: dateInputToApiDatetime(data.transactionDate),
            amount: data.amount,
            category_uid: data.categoryUid || defaultCategoryUid,
            description: data.description,
            account_uid: data.accountUid,
            payment_method: data.paymentMethod,
            tags: [],
            recurring: data.isRecurring
              ? {
                  interval_unit: data.recurring.intervalUnit,
                  interval_count: data.recurring.intervalCount,
                  anchor_date: data.recurring.anchorDate,
                }
              : null,
          }
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await onSubmit(payload)
      onOpenChange(false)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '發生錯誤，請稍後再試')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={mode === 'edit' ? '編輯交易' : '新增交易'}>
      <form onSubmit={handleSubmit(handleValidSubmit)} noValidate className="flex flex-col gap-4">
        <Controller
          control={control}
          name="transactionType"
          render={({ field }) => (
            <div role="radiogroup" aria-label="收支類型" className="grid grid-cols-3 gap-2">
              {(['expense', 'income', 'transfer'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={field.value === type}
                  onClick={() => field.onChange(type)}
                  className={`min-h-[44px] rounded-md border px-3 text-sm font-medium transition-colors ${
                    field.value === type
                      ? type === 'income'
                        ? 'border-income-500 bg-income-100 text-income-700'
                        : type === 'expense'
                          ? 'border-expense-500 bg-expense-100 text-expense-700'
                          : 'border-primary-500 bg-primary-100 text-primary-700'
                      : 'border-border text-text-secondary'
                  }`}
                >
                  {type === 'income' ? '收入' : type === 'expense' ? '支出' : '轉帳'}
                </button>
              ))}
            </div>
          )}
        />
        {errors.transactionType && (
          <p role="alert" className="text-sm text-danger-500">
            {errors.transactionType.message}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">日期</span>
          <input
            type="date"
            {...register('transactionDate')}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
          {errors.transactionDate && (
            <span role="alert" className="text-sm text-danger-500">
              {errors.transactionDate.message}
            </span>
          )}
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">金額</span>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <NumericKeypad mode="amount" value={field.value} onChange={field.onChange} />
            )}
          />
          {errors.amount && (
            <span role="alert" className="text-sm text-danger-500">
              {errors.amount.message}
            </span>
          )}
        </div>

        <button
          type="button"
          aria-expanded={showMoreFields}
          onClick={() => setMobileMoreOpen((v) => !v)}
          className="self-start text-sm font-medium text-primary-600 md:hidden"
        >
          {showMoreFields ? '收合欄位 ▴' : '更多欄位（分類/明細/帳戶/支付方式） ▾'}
        </button>

        <div className={`flex-col gap-4 md:flex ${showMoreFields ? 'flex' : 'hidden'}`}>
          {!isTransfer && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-text-secondary">分類</span>
              <select
                {...register('categoryUid')}
                className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
              >
                <option value="">未選（送出時補「其他」）</option>
                {(categories ?? []).map((category) => (
                  <option key={category.category_uid} value={category.category_uid}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">明細</span>
            <input
              type="text"
              maxLength={255}
              {...register('description')}
              className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">{isTransfer ? '轉出帳戶' : '帳戶'}</span>
            <select
              {...register('accountUid', { onChange: handleAccountUidChange })}
              className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
            >
              <option value="">請選擇帳戶</option>
              {(accounts ?? []).map((account) => (
                <option key={account.account_uid} value={account.account_uid}>
                  {account.name}
                </option>
              ))}
            </select>
            {errors.accountUid && (
              <span role="alert" className="text-sm text-danger-500">
                {errors.accountUid.message}
              </span>
            )}
          </label>

          {isTransfer && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-text-secondary">轉入帳戶</span>
              <select
                {...register('toAccountUid')}
                className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
              >
                <option value="">請選擇帳戶</option>
                {(accounts ?? []).map((account) => (
                  <option key={account.account_uid} value={account.account_uid}>
                    {account.name}
                  </option>
                ))}
              </select>
              {errors.toAccountUid && (
                <span role="alert" className="text-sm text-danger-500">
                  {errors.toAccountUid.message}
                </span>
              )}
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">支付方式</span>
            <input
              type="text"
              list="transaction-payment-method-options"
              maxLength={50}
              {...register('paymentMethod')}
              className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
            />
            <datalist id="transaction-payment-method-options">
              {PAYMENT_METHOD_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
        </div>

        {!isTransfer && (
          <label className="flex min-h-[44px] items-center gap-2">
            <input type="checkbox" {...register('isRecurring')} className="h-5 w-5" />
            <span className="text-sm text-text-primary">固定收支</span>
          </label>
        )}

        {!isTransfer && isRecurringChecked && (
          <Controller
            control={control}
            name="recurring"
            render={({ field }) => (
              <RecurringFieldset
                value={field.value}
                onChange={field.onChange}
                errors={{
                  intervalCount: errors.recurring?.intervalCount?.message,
                  anchorDate: errors.recurring?.anchorDate?.message,
                }}
              />
            )}
          />
        )}

        {submitError && (
          <p role="alert" className="text-sm text-danger-500">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-[44px] w-full rounded-md bg-primary-600 text-base font-semibold text-text-inverse disabled:opacity-50"
        >
          {isSubmitting ? '儲存中…' : '儲存'}
        </button>
      </form>
    </Dialog>
  )
}
