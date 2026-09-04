'use client'

import { useSyncExternalStore } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
  duration: number
}

const DEFAULT_DURATION_MS = 4000

type Listener = () => void

let toasts: ToastItem[] = []
let idCounter = 0
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): ToastItem[] {
  return toasts
}

function getServerSnapshot(): ToastItem[] {
  return []
}

function dismiss(id: string): void {
  if (!toasts.some((toast) => toast.id === id)) return
  toasts = toasts.filter((toast) => toast.id !== id)
  emit()
}

function push(message: string, variant: ToastVariant, duration: number): string {
  idCounter += 1
  const id = `toast-${idCounter}`
  toasts = [...toasts, { id, message, variant, duration }]
  emit()
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration)
  }
  return id
}

/** 測試專用：重置模組層級的全域 toast store，避免測試間互相汙染。 */
export function __resetToastStoreForTests(): void {
  toasts = []
  idCounter = 0
  emit()
}

export interface UseToastResult {
  toasts: ToastItem[]
  success: (message: string, duration?: number) => string
  error: (message: string, duration?: number) => string
  info: (message: string, duration?: number) => string
  dismiss: (id: string) => void
}

/**
 * 全域 Toast 通知（`→ FE-048`），取代原生 `alert()`（`→ FE-049` 禁用）。
 * 用 `useSyncExternalStore` 封裝模組層級的共用佇列：任何元件呼叫 `success` / `error` / `info`
 * 都會即時反映在掛於 root layout 的 `<Toaster>`，不需要透過 Redux store slice 傳遞
 * （共用元件禁止耦合特定 feature store，`→ FE-046`）。
 */
export function useToast(): UseToastResult {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return {
    toasts: items,
    success: (message, duration = DEFAULT_DURATION_MS) => push(message, 'success', duration),
    error: (message, duration = DEFAULT_DURATION_MS) => push(message, 'error', duration),
    info: (message, duration = DEFAULT_DURATION_MS) => push(message, 'info', duration),
    dismiss,
  }
}
