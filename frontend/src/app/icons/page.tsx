'use client'

import { useState, type ReactNode } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import { AppShell } from '@/components/common/AppShell'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Dialog } from '@/components/common/Dialog'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateBlocks'
import { IconUploadFlow } from '@/components/icons/IconUploadFlow'
import { useToast } from '@/hooks/useToast'
import {
  iconImageUrl,
  useDeleteIconMutation,
  useGetIconUsagesQuery,
  useListIconsQuery,
  type IconResponse,
} from '@/lib/api/iconsApi'
import { formatDate } from '@/utils/datetime'

// 大圖要讓使用者看清楚圖示在淺色與深色底上的樣子，底色刻意寫死（同 IconUploadFlow 預覽）
const DETAIL_BACKGROUNDS = [
  { key: 'light', label: '淺色', color: '#FFFFFF' },
  { key: 'dark', label: '深色', color: '#1F1D2B' },
] as const

function usageLabel(count: number): string {
  return count > 0 ? `${count} 個使用中` : '未使用'
}

function deleteDescription(accounts: number, categories: number): string {
  const parts = [accounts > 0 ? `${accounts} 個帳戶` : '', categories > 0 ? `${categories} 個分類` : ''].filter(
    Boolean,
  )
  return parts.length > 0 ? `有 ${parts.join('、')}會改回預設圖示，確定刪除？` : '確定刪除？'
}

interface IconDetailDialogProps {
  icon: IconResponse | null
  onClose: () => void
}

function IconDetailDialog({ icon, onClose }: IconDetailDialogProps): ReactNode {
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const { data: usages, isLoading } = useGetIconUsagesQuery(icon?.user_icon_uid ?? '', {
    skip: icon === null,
    refetchOnMountOrArgChange: true,
  })
  const [deleteIcon, { isLoading: isDeleting }] = useDeleteIconMutation()

  const accountCount = usages?.accounts.length ?? 0
  const categoryCount = usages?.categories.length ?? 0

  async function handleDelete(): Promise<void> {
    if (icon === null) return
    setConfirming(false)
    try {
      const result = await deleteIcon(icon.user_icon_uid).unwrap()
      const reset = result.reset_accounts + result.reset_categories
      toast.success(reset > 0 ? `已刪除，${reset} 個項目改回預設圖示` : '已刪除')
      onClose()
    } catch {
      toast.error('刪除失敗，請稍後再試')
    }
  }

  return (
    <>
      <Dialog open={icon !== null} onOpenChange={(open) => (open ? undefined : onClose())} title="圖示詳細">
        {icon ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              {DETAIL_BACKGROUNDS.map((bg) => (
                <div
                  key={bg.key}
                  className="flex flex-col items-center gap-1 rounded-md p-4"
                  style={{ backgroundColor: bg.color }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 需帶 cookie，由瀏覽器直接載入 */}
                  <img src={iconImageUrl(icon.user_icon_uid)} alt="" className="h-24 w-24 object-contain" />
                  <span className="text-xs" style={{ color: bg.key === 'light' ? '#1F1D2B' : '#F4F2FA' }}>
                    {bg.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-sm text-text-secondary">上傳日期：{formatDate(icon.created_at)}</p>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-primary">使用中</span>
              {isLoading ? (
                <span className="text-sm text-text-secondary">載入中…</span>
              ) : accountCount + categoryCount === 0 ? (
                <span className="text-sm text-text-secondary">沒有帳戶或分類使用這張圖示</span>
              ) : (
                <ul className="flex flex-col gap-1 text-sm text-text-primary">
                  {usages?.accounts.map((a) => (
                    <li key={a.account_uid}>帳戶：{a.name}</li>
                  ))}
                  {usages?.categories.map((c) => (
                    <li key={c.category_uid}>分類：{c.name}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={isDeleting || isLoading}
                className="min-h-11 rounded-md bg-danger-500 px-4 font-medium text-text-inverse disabled:opacity-50"
              >
                {isDeleting ? '刪除中…' : '刪除'}
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={confirming}
        title="刪除圖示"
        description={deleteDescription(accountCount, categoryCount)}
        confirmLabel="刪除"
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}

/**
 * 我的圖示（ADR-0006 §6）：上方上傳區，下方已上傳圖示（新的在前）；點圖示看使用情況與刪除。
 * 入口在行動端「更多」與桌機側邊欄。
 */
export default function IconsPage(): ReactNode {
  const { data, isLoading, isError, refetch } = useListIconsQuery(undefined, { refetchOnMountOrArgChange: true })
  const [selected, setSelected] = useState<IconResponse | null>(null)
  const quotaFull = data ? data.quota.used >= data.quota.limit : false

  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 bg-bg p-6">
          <h1 className="text-2xl font-bold text-text-primary md:text-3xl">我的圖示</h1>

          <section className="flex flex-col gap-2" aria-label="上傳圖示">
            <IconUploadFlow
              variant="dropzone"
              disabled={quotaFull}
              disabledReason={data ? `已達 ${data.quota.limit} 張上限，請先刪除不用的圖示` : undefined}
            />
            {data ? (
              <p className="text-sm text-text-secondary">
                已使用 {data.quota.used} / {data.quota.limit}
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-3" aria-label="已上傳圖示">
            <h2 className="text-lg font-semibold text-text-primary">已上傳圖示</h2>
            {isLoading ? <LoadingState rows={2} /> : null}
            {isError ? <ErrorState message="圖示載入失敗" onRetry={() => void refetch()} /> : null}
            {data && data.items.length === 0 ? (
              <EmptyState title="還沒有上傳圖示" description="上傳後就能在帳戶與分類選用" />
            ) : null}
            {data && data.items.length > 0 ? (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {data.items.map((icon) => (
                  <li key={icon.user_icon_uid}>
                    <button
                      type="button"
                      onClick={() => setSelected(icon)}
                      aria-label={`圖示，${usageLabel(icon.usage_count)}`}
                      className="flex w-full flex-col items-center gap-2 rounded-md border border-border bg-surface p-3 transition-colors hover:border-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- 需帶 cookie，由瀏覽器直接載入 */}
                      <img
                        src={iconImageUrl(icon.user_icon_uid)}
                        alt=""
                        loading="lazy"
                        className="h-14 w-14 object-contain"
                      />
                      <span className="text-xs text-text-secondary">{usageLabel(icon.usage_count)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </main>
        <IconDetailDialog icon={selected} onClose={() => setSelected(null)} />
      </AppShell>
    </AuthGuard>
  )
}
