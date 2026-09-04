'use client'

import { useCallback, useSyncExternalStore } from 'react'

// 「本裝置記住的帳號」清單（→ design-spec.md §1 [A3] / §12.2）：只存遮罩 email +
// 顯示名稱（email local-part）+ 頭像色（依 user_uid 雜湊挑色，純前端展示用，非後端欄位）
// + user_uid（供 POST /auth/login/pin 使用），非機密展示用資料；PIN 與密碼本身一律不落地。
export interface DeviceAccount {
  user_uid: string
  maskedEmail: string
  displayName: string
  avatarColor: string
}

export interface RememberAccountInput {
  user_uid: string
  email: string
}

const STORAGE_KEY = 'device-accounts'
const EMPTY_ACCOUNTS: DeviceAccount[] = []
// 純裝飾用固定色票（呼應 §2.2 品牌色系），依 user_uid 雜湊決定性挑色，同一帳號永遠同色
const AVATAR_PALETTE = [
  '#8257D6',
  '#5FC9A4',
  '#E8746B',
  '#4FAE6D',
  '#C97A1E',
  '#9B72E8',
] as const

function isDeviceAccount(value: unknown): value is DeviceAccount {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.user_uid === 'string' &&
    typeof record.maskedEmail === 'string' &&
    typeof record.displayName === 'string' &&
    typeof record.avatarColor === 'string'
  )
}

function hashToIndex(value: string, modulo: number): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash % modulo
}

function pickAvatarColor(userUid: string): string {
  // AVATAR_PALETTE 為固定長度陣列，computed index 存取在 noUncheckedIndexedAccess 下型別是
  // string | undefined；modulo 保證落在陣列範圍內，fallback 只是滿足型別、實際不會走到。
  return AVATAR_PALETTE[hashToIndex(userUid, AVATAR_PALETTE.length)] ?? AVATAR_PALETTE[0]
}

// email 遮罩：僅保留 local-part 首尾各 1 碼（j1025178@gmail.com → j***8@gmail.com，
// → design-spec.md §9.1 mockup），local-part 長度 ≤ 2 時僅保留首碼；charAt 對越界索引回傳
// 空字串而非 undefined，避免 noUncheckedIndexedAccess 誤判。
function maskEmail(email: string): string {
  const atIndex = email.indexOf('@')
  if (atIndex <= 0) return email
  const local = email.slice(0, atIndex)
  const domain = email.slice(atIndex)
  if (local.length <= 2) return `${local.charAt(0)}***${domain}`
  return `${local.charAt(0)}***${local.charAt(local.length - 1)}${domain}`
}

function extractDisplayName(email: string): string {
  const atIndex = email.indexOf('@')
  return atIndex > 0 ? email.slice(0, atIndex) : email
}

// localStorage 寫入失敗（如隱私模式）時的 in-memory 降級值（→ 同 useThemePreference.ts 慣例）
let memoryFallback: DeviceAccount[] | null = null
// 以「上次讀到的原始字串」作快取 key，避免 readAccounts() 每次都 JSON.parse 出新陣列參考
// （useSyncExternalStore 要求資料未變時 getSnapshot 回傳同一參考，否則 React 會判定無限迴圈）
let cachedRaw: string | null = null
let cachedAccounts: DeviceAccount[] = EMPTY_ACCOUNTS

const listeners = new Set<() => void>()

function notifyListeners(): void {
  listeners.forEach((listener) => listener())
}

function readAccounts(): DeviceAccount[] {
  if (memoryFallback !== null) return memoryFallback
  let raw: string | null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return EMPTY_ACCOUNTS
  }
  if (raw === cachedRaw) return cachedAccounts
  cachedRaw = raw
  if (!raw) {
    cachedAccounts = EMPTY_ACCOUNTS
    return cachedAccounts
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    cachedAccounts = Array.isArray(parsed) ? parsed.filter(isDeviceAccount) : EMPTY_ACCOUNTS
  } catch {
    cachedAccounts = EMPTY_ACCOUNTS
  }
  return cachedAccounts
}

function writeAccounts(next: DeviceAccount[]): void {
  cachedAccounts = next
  cachedRaw = null
  try {
    const serialized = JSON.stringify(next)
    window.localStorage.setItem(STORAGE_KEY, serialized)
    cachedRaw = serialized
    memoryFallback = null
  } catch {
    memoryFallback = next
  }
  notifyListeners()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  // 跨分頁：其他分頁改了 localStorage 時同步（同分頁內的變更改走 notifyListeners，見 writeAccounts）
  const handleStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY || event.key === null) onChange()
  }
  window.addEventListener('storage', handleStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', handleStorage)
  }
}

function getSnapshot(): DeviceAccount[] {
  return readAccounts()
}

function getServerSnapshot(): DeviceAccount[] {
  return EMPTY_ACCOUNTS
}

export interface UseDeviceAccountsResult {
  accounts: DeviceAccount[]
  rememberAccount: (input: RememberAccountInput) => void
  forgetAccount: (userUid: string) => void
}

/**
 * 讀寫「本裝置記住的帳號」清單（→ design-spec.md §1 [A3] / §12.2）。`rememberAccount` 在
 * `loginWithPin` 成功後呼叫（新增或更新既有項目，同一 user_uid 只會有一筆）；
 * `forgetAccount` 在 `deletePin` 成功後呼叫，清除該帳號的快速登入旗標。
 * 用 `useSyncExternalStore` 讀 localStorage 這個外部來源，SSR 安全（server snapshot 固定回
 * 空陣列），與 `useThemePreference` 同一慣例。
 */
export function useDeviceAccounts(): UseDeviceAccountsResult {
  const accounts = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const rememberAccount = useCallback((input: RememberAccountInput): void => {
    const current = readAccounts().filter((account) => account.user_uid !== input.user_uid)
    const next: DeviceAccount = {
      user_uid: input.user_uid,
      maskedEmail: maskEmail(input.email),
      displayName: extractDisplayName(input.email),
      avatarColor: pickAvatarColor(input.user_uid),
    }
    writeAccounts([...current, next])
  }, [])

  const forgetAccount = useCallback((userUid: string): void => {
    const current = readAccounts()
    writeAccounts(current.filter((account) => account.user_uid !== userUid))
  }, [])

  return { accounts, rememberAccount, forgetAccount }
}
