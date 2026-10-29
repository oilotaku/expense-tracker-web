'use client'

import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Dialog } from '@/components/common/Dialog'
import { useToast } from '@/hooks/useToast'
import { previewIcon, IconPreviewError, useUploadIconMutation, type IconResponse } from '@/lib/api/iconsApi'
import { resizeForUpload } from '@/utils/resizeImage'

export interface IconUploadFlowProps {
  /** `dropzone`：「我的圖示」頁上方的拖放區；`button`：圖示挑選器裡的小按鈕 */
  variant: 'dropzone' | 'button'
  disabled?: boolean
  /** 停用時顯示的原因（例如配額已滿） */
  disabledReason?: string
  onUploaded?: (icon: IconResponse) => void
}

const PREVIEW_DEBOUNCE_MS = 300

// 預覽要讓使用者看到圖示在淺色與深色畫面上的樣子，這兩個底色刻意寫死，不跟目前主題走
const PREVIEW_THEMES = [
  { key: 'light', label: '淺色', background: '#FFFFFF', text: '#1F1D2B', card: '#F4F2FA' },
  { key: 'dark', label: '深色', background: '#1F1D2B', text: '#F4F2FA', card: '#2C2940' },
] as const

function errorDetail(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'data' in error) {
    const data = (error as { data: unknown }).data
    if (data !== null && typeof data === 'object' && 'detail' in data && typeof data.detail === 'string') {
      return data.detail
    }
  }
  return '上傳失敗，請稍後再試'
}

interface BlobEntry {
  blob: Blob
  url: string
}

/** Blob 與它的 object URL 綁在一起換：換新的時候釋放舊網址，卸載時全部釋放。 */
function useBlobEntry(): [BlobEntry | null, (blob: Blob | null) => void] {
  const [entry, setEntry] = useState<BlobEntry | null>(null)
  const currentRef = useRef<BlobEntry | null>(null)
  const replace = useCallback((blob: Blob | null) => {
    if (currentRef.current) URL.revokeObjectURL(currentRef.current.url)
    const next = blob ? { blob, url: URL.createObjectURL(blob) } : null
    currentRef.current = next
    setEntry(next)
  }, [])
  useEffect(
    () => () => {
      if (currentRef.current) URL.revokeObjectURL(currentRef.current.url)
    },
    [],
  )
  return [entry, replace]
}

function PreviewTiles({ src }: { src: string }): ReactNode {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PREVIEW_THEMES.map((theme) => (
        <div
          key={theme.key}
          className="flex flex-col gap-3 rounded-md p-3"
          style={{ backgroundColor: theme.background, color: theme.text }}
          data-testid={`preview-${theme.key}`}
        >
          <span className="text-xs opacity-70">{theme.label}</span>
          <div className="flex items-center gap-2 rounded-md p-2" style={{ backgroundColor: theme.card }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: 預覽圖，不經 next/image */}
            <img src={src} alt="" className="h-11 w-11 object-contain" />
            <span className="text-sm">帳戶</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: 預覽圖，不經 next/image */}
            <img src={src} alt="" className="h-11 w-11 object-contain" />
            <span className="text-sm">分類</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * 選圖 → 用戶端縮圖 → 後端預覽 → 使用者確認才上傳（ADR-0006 §5）。預覽與上傳送同一份縮圖後
 * 的檔案與同一組選項，後端處理是確定性的，所以存下來的就是預覽看到的那張。
 */
export function IconUploadFlow({
  variant,
  disabled = false,
  disabledReason,
  onUploaded,
}: IconUploadFlowProps): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const [open, setOpen] = useState(false)
  // 第一次打開才掛載對話框：每個圖示挑選器都有一份上傳流程，平常不必多掛一個 Dialog
  const [mounted, setMounted] = useState(false)
  const [sourceEntry, setSource] = useBlobEntry()
  const [removeWhite, setRemoveWhite] = useState(false)
  const [previewEntry, setPreview] = useBlobEntry()
  const [previewError, setPreviewError] = useState('')
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadIcon, { isLoading: isUploading }] = useUploadIconMutation()
  const source = sourceEntry?.blob ?? null
  const sourceUrl = sourceEntry?.url ?? null
  const preview = previewEntry?.blob ?? null
  const previewUrl = previewEntry?.url ?? null

  useEffect(() => {
    if (source === null) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setIsPreviewing(true)
      setPreviewError('')
      previewIcon({ image: source, removeWhiteBackground: removeWhite }, controller.signal)
        .then((blob) => setPreview(blob))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setPreview(null)
          setPreviewError(error instanceof IconPreviewError ? error.message : '預覽失敗，請稍後再試')
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsPreviewing(false)
        })
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [source, removeWhite, setPreview])

  async function startWithFile(file: File): Promise<void> {
    setPreview(null)
    setPreviewError('')
    setMounted(true)
    setOpen(true)
    setSource(await resizeForUpload(file))
  }

  function openPicker(): void {
    if (!disabled) inputRef.current?.click()
  }

  function close(): void {
    setOpen(false)
    setSource(null)
    setPreview(null)
    setPreviewError('')
    setRemoveWhite(false)
  }

  async function confirm(): Promise<void> {
    if (source === null) return
    try {
      const icon = await uploadIcon({ image: source, removeWhiteBackground: removeWhite }).unwrap()
      toast.success('圖示已儲存')
      onUploaded?.(icon)
      close()
    } catch (error) {
      setPreviewError(errorDetail(error))
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files[0]
    if (file && !disabled) void startWithFile(file)
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      data-testid="icon-file-input"
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void startWithFile(file)
      }}
    />
  )

  const trigger =
    variant === 'dropzone' ? (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openPicker()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
          disabled
            ? 'cursor-not-allowed border-border opacity-60'
            : isDragging
              ? 'cursor-pointer border-primary-600 bg-primary-100'
              : 'cursor-pointer border-border bg-surface hover:border-primary-600'
        }`}
      >
        <span className="hidden text-base font-medium text-text-primary md:inline">
          拖曳圖片到這裡，或點擊選擇
        </span>
        <span className="inline-flex min-h-11 items-center rounded-md bg-primary-600 px-4 font-medium text-text-inverse md:hidden">
          選擇圖片
        </span>
        <span className="text-sm text-text-secondary">
          {disabled && disabledReason ? disabledReason : '支援 PNG、JPEG、WebP、GIF，會自動縮成 256×256'}
        </span>
      </div>
    ) : (
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        className="flex h-11 items-center rounded-md border border-dashed border-border bg-surface px-3 text-sm text-text-primary transition-colors hover:border-primary-600 disabled:opacity-50"
      >
        ＋ 上傳新圖示
      </button>
    )

  return (
    <>
      {fileInput}
      {trigger}
      {mounted ? (
        <Dialog
          open={open}
          onOpenChange={(next) => (next ? setOpen(true) : close())}
          title="預覽圖示"
          description="確認後才會儲存"
        >
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <figure className="flex flex-col items-center gap-1">
                <div className="flex h-32 w-full items-center justify-center rounded-md bg-surface-sunken p-2">
                  {sourceUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- blob: 原圖，不經 next/image
                    <img src={sourceUrl} alt="原圖" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-sm text-text-secondary">讀取中…</span>
                  )}
                </div>
                <figcaption className="text-xs text-text-secondary">原圖</figcaption>
              </figure>
              <figure className="flex flex-col items-center gap-1">
                <div className="flex h-32 w-full items-center justify-center rounded-md bg-surface-sunken p-2">
                  {previewUrl && !isPreviewing ? (
                    // eslint-disable-next-line @next/next/no-img-element -- blob: 預覽圖，不經 next/image
                    <img src={previewUrl} alt="處理後的圖示" className="h-full object-contain" />
                  ) : (
                    <span className="text-sm text-text-secondary">{previewError ? '—' : '處理中…'}</span>
                  )}
                </div>
                <figcaption className="text-xs text-text-secondary">處理後（256×256）</figcaption>
              </figure>
            </div>

            {previewUrl && !isPreviewing ? <PreviewTiles src={previewUrl} /> : null}

            <label className="flex min-h-11 items-center gap-2 text-text-primary">
              <input
                type="checkbox"
                checked={removeWhite}
                onChange={(event) => setRemoveWhite(event.target.checked)}
                className="h-5 w-5"
              />
              去除白色背景
            </label>

            {previewError ? (
              <p role="alert" className="text-sm text-danger-500">
                {previewError}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={openPicker}
                className="min-h-11 rounded-md border border-border px-4 text-text-primary"
              >
                重新選擇
              </button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={!preview || isPreviewing || isUploading || previewError !== ''}
                className="min-h-11 rounded-md bg-primary-600 px-4 font-medium text-text-inverse disabled:opacity-50"
              >
                {isUploading ? '儲存中…' : '使用這張'}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  )
}
