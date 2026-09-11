'use client'

import { useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { useRouter } from 'next/navigation'
import { useDispatch } from 'react-redux'
import { AuthGuard } from '@/components/AuthGuard'
import { AppShell } from '@/components/common/AppShell'
import { Dialog } from '@/components/common/Dialog'
import { NumericKeypad } from '@/components/common/NumericKeypad'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { useDeviceAccounts } from '@/hooks/useDeviceAccounts'
import { useListAccountsQuery } from '@/lib/api/accountsApi'
import { baseApi } from '@/lib/api/baseApi'
import {
  getAuthErrorMessage,
  useChangePinMutation,
  useDeletePinMutation,
  useGetMeQuery,
  useLogoutMutation,
  useSetPinMutation,
} from '@/lib/api/authApi'
import type { AppDispatch } from '@/store/store'

// design-spec.md §9.7：帳戶預設值 localStorage key，沿用 TransactionFormDialog.tsx 既有的
// 'default-account-uid'（→ A11 同機制）。本頁是第二處讀寫同一 key 的地方（FE-044「被 ≥2 處使用
// 才抽共用檔」門檻已達成），但 hooks/ 與 lib/ 皆不在本 task（task-021）affected_files 內、不可
// 新增或修改共用檔，故先各自維持獨立實作，抽共用留待後續 task 處理（非本 task 可解的重構債）。
const DEFAULT_ACCOUNT_STORAGE_KEY = 'default-account-uid'

function readDefaultAccountUid(): string {
  try {
    return window.localStorage.getItem(DEFAULT_ACCOUNT_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeDefaultAccountUid(accountUid: string): void {
  try {
    if (accountUid) {
      window.localStorage.setItem(DEFAULT_ACCOUNT_STORAGE_KEY, accountUid)
    } else {
      window.localStorage.removeItem(DEFAULT_ACCOUNT_STORAGE_KEY)
    }
  } catch {
    // 私密瀏覽模式等場景寫入失敗時降級為「不記住」，不影響本次選擇當下的畫面顯示
  }
}

// PIN 是否已設定：GET /auth/me（UserResponse，backend/app/schemas/auth.py）目前只回傳
// user_uid/email，未回傳 has_pin 欄位，本 task affected_files 不含後端、無法新增該欄位（已知
// 後端缺口，同 authApi.ts 內 GET /auth/me 註解慣例，非本 task 範圍）。改用「本瀏覽器依 user_uid
// 記住的近似值」：本頁完成設定/停用 PIN 時同步寫入，下次載入直接讀回；若近似值與後端實際狀態
// 不同步（如換瀏覽器、其他裝置改過），設定 PIN 時遇到後端回 409（已設定）會自我修正畫面狀態
// （見 PinSetupDialog 的 handleConfirmComplete）。
function pinStatusStorageKey(userUid: string): string {
  return `pin-status:${userUid}`
}

function readHasPin(userUid: string): boolean {
  try {
    return window.localStorage.getItem(pinStatusStorageKey(userUid)) === 'set'
  } catch {
    return false
  }
}

function writeHasPin(userUid: string, hasPin: boolean): void {
  try {
    if (hasPin) {
      window.localStorage.setItem(pinStatusStorageKey(userUid), 'set')
    } else {
      window.localStorage.removeItem(pinStatusStorageKey(userUid))
    }
  } catch {
    // 同上，私密瀏覽模式降級：畫面 state 仍會更新，只是重新整理後會回到預設「未設定」判斷
  }
}

// FE-029：錯誤處理必用型別收窄，禁 `error as any`（同 PinLoginPad.tsx toAuthError 慣例，本 task
// affected_files 不含該檔，無法直接匯入複用，就地重寫同一段極短邏輯）。
function toAuthError(error: unknown): FetchBaseQueryError | SerializedError | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  if ('status' in error || 'message' in error) return error as FetchBaseQueryError | SerializedError
  return undefined
}

function errorStatus(error: FetchBaseQueryError | SerializedError | undefined): number | undefined {
  if (error !== undefined && 'status' in error && typeof error.status === 'number') return error.status
  return undefined
}

const LOCKED_MESSAGE_FALLBACK = 'PIN 已鎖定，請改用密碼登入或稍後再試'

const SECTION_CLASS = 'flex flex-col gap-3 rounded-xl border border-border bg-surface p-4'
const INPUT_CLASS =
  'min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'
const PRIMARY_BUTTON_CLASS =
  'min-h-11 rounded-md bg-primary-600 px-4 font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'
const SECONDARY_BUTTON_CLASS =
  'min-h-11 rounded-md border border-border px-4 font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'
const DANGER_BUTTON_CLASS =
  'min-h-11 rounded-md border border-danger-500 px-4 font-medium text-danger-700 transition-colors hover:bg-danger-500/10 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-500'

interface PinDialogBaseProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SetPinStep = 'password' | 'pin' | 'confirm'

interface PinSetupDialogProps extends PinDialogBaseProps {
  onSuccess: () => void
}

/**
 * design-spec §9.7：未設定 PIN 時「設定 PIN」流程 —— 先輸入目前密碼重新驗證身份，
 * 再用 `<NumericKeypad mode="pin">` 輸入兩次確認一致後，一次呼叫 `POST /auth/pin`
 * （`{ pin, password }`，task-014 `useSetPinMutation`）。已設定過 PIN 時後端回 409，
 * 視為本機狀態過期，直接自我修正為「已設定」並引導使用者改走「變更 PIN」。
 */
function PinSetupDialog({ open, onOpenChange, onSuccess }: PinSetupDialogProps): ReactNode {
  const [step, setStep] = useState<SetPinStep>('password')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [setPinMutation, { isLoading }] = useSetPinMutation()

  // 依 React 文件建議的「render 期間依 prop 變化調整 state」寫法（非 useEffect，
  // → accounts/page.tsx AccountCreateDialog 同寫法）：每次對話框從關到開重置整個流程狀態。
  const [syncedOpen, setSyncedOpen] = useState(open)
  if (open !== syncedOpen) {
    setSyncedOpen(open)
    if (open) {
      setStep('password')
      setPassword('')
      setPin('')
      setConfirmPin('')
      setErrorMessage(null)
    }
  }

  function handlePasswordSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!password) return
    setErrorMessage(null)
    setStep('pin')
  }

  function handlePinComplete(value: string): void {
    setPin(value)
    setStep('confirm')
  }

  async function handleConfirmComplete(value: string): Promise<void> {
    if (value !== pin) {
      setConfirmPin('')
      setErrorMessage('兩次輸入的 PIN 不一致，請重新輸入')
      return
    }
    setErrorMessage(null)
    try {
      await setPinMutation({ pin: value, password }).unwrap()
      onSuccess()
      onOpenChange(false)
    } catch (caught) {
      const authError = toAuthError(caught)
      if (errorStatus(authError) === 409) {
        onSuccess()
        onOpenChange(false)
        return
      }
      setPin('')
      setConfirmPin('')
      setStep('password')
      setErrorMessage(getAuthErrorMessage(authError) || '設定失敗，請稍後再試')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="設定 PIN">
      <div className="flex flex-col gap-4">
        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-text-secondary">請先輸入目前密碼以驗證身份</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <button type="submit" disabled={!password} className={PRIMARY_BUTTON_CLASS}>
              下一步
            </button>
          </form>
        )}
        {step === 'pin' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">請輸入新的 6 碼 PIN</p>
            <NumericKeypad
              mode="pin"
              autoComplete="new-password"
              value={pin}
              onChange={setPin}
              onComplete={handlePinComplete}
              disabled={isLoading}
            />
          </div>
        )}
        {step === 'confirm' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">請再輸入一次以確認</p>
            <NumericKeypad
              mode="pin"
              autoComplete="new-password"
              value={confirmPin}
              onChange={setConfirmPin}
              onComplete={handleConfirmComplete}
              disabled={isLoading}
              error={errorMessage !== null}
            />
          </div>
        )}
        {errorMessage && (
          <p role="alert" className="text-center text-sm text-danger-700">
            {errorMessage}
          </p>
        )}
      </div>
    </Dialog>
  )
}

type ChangePinStep = 'current' | 'new'

type PinChangeDialogProps = PinDialogBaseProps

/**
 * design-spec §9.7：已設定 PIN 時「變更 PIN」—— 先驗證舊 PIN，再輸入新 PIN，一次呼叫
 * `PATCH /auth/pin`（`{ current_pin, new_pin }`）。`current_pin` 錯誤回 401；鎖定機制
 * （`→ A15`，連續失敗 5 次鎖 15 分鐘）回 429，訊息與 PinLoginPad.tsx 同一套處理慣例。變更成功
 * 不影響「是否已設定 PIN」狀態（仍是 true），故不需要 onSuccess 回呼給父層。
 */
function PinChangeDialog({ open, onOpenChange }: PinChangeDialogProps): ReactNode {
  const [step, setStep] = useState<ChangePinStep>('current')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [changePin, { isLoading }] = useChangePinMutation()

  const [syncedOpen, setSyncedOpen] = useState(open)
  if (open !== syncedOpen) {
    setSyncedOpen(open)
    if (open) {
      setStep('current')
      setCurrentPin('')
      setNewPin('')
      setErrorMessage(null)
      setIsLocked(false)
    }
  }

  function handleCurrentComplete(value: string): void {
    setCurrentPin(value)
    setErrorMessage(null)
    setStep('new')
  }

  async function handleNewComplete(value: string): Promise<void> {
    try {
      await changePin({ current_pin: currentPin, new_pin: value }).unwrap()
      onOpenChange(false)
    } catch (caught) {
      const authError = toAuthError(caught)
      setNewPin('')
      if (errorStatus(authError) === 429) {
        setIsLocked(true)
        setErrorMessage(getAuthErrorMessage(authError) || LOCKED_MESSAGE_FALLBACK)
        return
      }
      setIsLocked(false)
      setCurrentPin('')
      setStep('current')
      setErrorMessage(getAuthErrorMessage(authError) || '舊 PIN 錯誤')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="變更 PIN">
      <div className="flex flex-col gap-3">
        {step === 'current' && (
          <>
            <p className="text-sm text-text-secondary">請輸入目前的 6 碼 PIN</p>
            <NumericKeypad
              mode="pin"
              autoComplete="current-password"
              value={currentPin}
              onChange={setCurrentPin}
              onComplete={handleCurrentComplete}
              disabled={isLoading || isLocked}
              error={errorMessage !== null}
            />
          </>
        )}
        {step === 'new' && (
          <>
            <p className="text-sm text-text-secondary">請輸入新的 6 碼 PIN</p>
            <NumericKeypad
              mode="pin"
              autoComplete="new-password"
              value={newPin}
              onChange={setNewPin}
              onComplete={handleNewComplete}
              disabled={isLoading}
            />
          </>
        )}
        {errorMessage && (
          <p role="alert" className="text-center text-sm text-danger-700">
            {errorMessage}
          </p>
        )}
      </div>
    </Dialog>
  )
}

interface PinDisableDialogProps extends PinDialogBaseProps {
  userUid: string
  onSuccess: () => void
}

/**
 * design-spec §9.7：已設定 PIN 時「停用 PIN 快速登入」—— 輸入目前密碼重新驗證身份，呼叫
 * `DELETE /auth/pin`（`{ password }`）。成功後依 `useDeviceAccounts` 文件慣例清除本機該帳號的
 * 「快速登入」旗標（`forgetAccount`，→ design-spec.md §12.2）。
 */
function PinDisableDialog({ open, onOpenChange, userUid, onSuccess }: PinDisableDialogProps): ReactNode {
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deletePin, { isLoading }] = useDeletePinMutation()
  const { forgetAccount } = useDeviceAccounts()

  const [syncedOpen, setSyncedOpen] = useState(open)
  if (open !== syncedOpen) {
    setSyncedOpen(open)
    if (open) {
      setPassword('')
      setErrorMessage(null)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!password) return
    setErrorMessage(null)
    try {
      await deletePin({ password }).unwrap()
      forgetAccount(userUid)
      onSuccess()
      onOpenChange(false)
    } catch (caught) {
      setErrorMessage(getAuthErrorMessage(toAuthError(caught)) || '停用失敗，請稍後再試')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="停用 PIN 快速登入"
      description="停用後需以密碼重新登入，或之後重新設定 PIN"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">請輸入目前密碼以驗證身份</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        {errorMessage && (
          <p role="alert" className="text-sm text-danger-700">
            {errorMessage}
          </p>
        )}
        <button type="submit" disabled={isLoading || !password} className={DANGER_BUTTON_CLASS}>
          {isLoading ? '停用中…' : '停用'}
        </button>
      </form>
    </Dialog>
  )
}

function SettingsPageContent(): ReactNode {
  const router = useRouter()
  const dispatch = useDispatch<AppDispatch>()
  const { data: me } = useGetMeQuery()
  const userUid = me?.user_uid ?? ''

  // 見上方 readHasPin 註解：本機近似值，mount 時讀一次即可（AuthGuard 已保證此時 `me` 就緒）。
  const [hasPin, setHasPin] = useState<boolean>(() => (userUid ? readHasPin(userUid) : false))

  const { data: accountsData } = useListAccountsQuery()
  const accounts = useMemo(() => accountsData?.items ?? [], [accountsData])
  const [defaultAccountUid, setDefaultAccountUid] = useState<string>(() => readDefaultAccountUid())
  const { rememberAccount } = useDeviceAccounts()

  const [isSetPinOpen, setIsSetPinOpen] = useState(false)
  const [isChangePinOpen, setIsChangePinOpen] = useState(false)
  const [isDisablePinOpen, setIsDisablePinOpen] = useState(false)
  const [logoutMutation] = useLogoutMutation()

  function handleDefaultAccountChange(event: ChangeEvent<HTMLSelectElement>): void {
    const next = event.target.value
    setDefaultAccountUid(next)
    writeDefaultAccountUid(next)
  }

  function handleSetPinSuccess(): void {
    setHasPin(true)
    if (userUid) writeHasPin(userUid, true)
    // task-031：設定 PIN 成功（含 409 自我修正，見 PinSetupDialog.handleConfirmComplete）後
    // 記住本裝置的帳號，否則 /login 的 PIN 快速登入入口（→ useDeviceAccounts().accounts）永遠不會出現。
    if (userUid && me?.email) rememberAccount({ user_uid: userUid, email: me.email })
  }

  function handleDisablePinSuccess(): void {
    setHasPin(false)
    if (userUid) writeHasPin(userUid, false)
  }

  async function handleLogout(): Promise<void> {
    // POST /auth/logout 清除後端 httpOnly cookie（task-034）；即使呼叫失敗（例如 cookie 已
    // 過期）也不擋登出流程，仍清空前端 RTK Query 快取並導回登入頁。
    try {
      await logoutMutation().unwrap()
    } catch {
      // 忽略：cookie 清除失敗不影響本機登出流程
    }
    dispatch(baseApi.util.resetApiState())
    router.push('/login')
  }

  return (
    <AppShell onLogout={handleLogout}>
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 bg-bg p-6">
        <h1 className="text-2xl font-bold text-text-primary md:text-3xl">設定</h1>

        <section className={SECTION_CLASS}>
          <h2 className="text-lg font-semibold text-text-primary">個人資料</h2>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">Email</span>
            <span className="text-text-primary">{me?.email ?? ''}</span>
          </div>
        </section>

        <section className={SECTION_CLASS}>
          <h2 className="text-lg font-semibold text-text-primary">PIN 快速登入</h2>
          {!hasPin && (
            <button type="button" onClick={() => setIsSetPinOpen(true)} className={PRIMARY_BUTTON_CLASS}>
              設定 PIN
            </button>
          )}
          {hasPin && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => setIsChangePinOpen(true)} className={SECONDARY_BUTTON_CLASS}>
                變更 PIN
              </button>
              <button type="button" onClick={() => setIsDisablePinOpen(true)} className={DANGER_BUTTON_CLASS}>
                停用 PIN 快速登入
              </button>
            </div>
          )}
        </section>

        <section className={`${SECTION_CLASS} flex-row items-center justify-between`}>
          <h2 className="text-lg font-semibold text-text-primary">外觀</h2>
          <ThemeToggle />
        </section>

        <section className={SECTION_CLASS}>
          <h2 className="text-lg font-semibold text-text-primary">預設記帳帳戶</h2>
          <select value={defaultAccountUid} onChange={handleDefaultAccountChange} className={INPUT_CLASS}>
            <option value="">未設定（每次新增交易需手動選擇）</option>
            {accounts.map((account) => (
              <option key={account.account_uid} value={account.account_uid}>
                {account.name}
              </option>
            ))}
          </select>
        </section>

        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-11 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken hover:text-danger-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          登出
        </button>

        <PinSetupDialog open={isSetPinOpen} onOpenChange={setIsSetPinOpen} onSuccess={handleSetPinSuccess} />
        <PinChangeDialog open={isChangePinOpen} onOpenChange={setIsChangePinOpen} />
        <PinDisableDialog
          open={isDisablePinOpen}
          onOpenChange={setIsDisablePinOpen}
          userUid={userUid}
          onSuccess={handleDisablePinSuccess}
        />
      </main>
    </AppShell>
  )
}

export default function SettingsPage(): ReactNode {
  return (
    <AuthGuard>
      <SettingsPageContent />
    </AuthGuard>
  )
}
