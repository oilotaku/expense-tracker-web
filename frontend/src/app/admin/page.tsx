'use client'

import { useState, type ReactNode } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import { AppShell } from '@/components/common/AppShell'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CurvedCard } from '@/components/common/CurvedCard'
import { Dialog } from '@/components/common/Dialog'
import { useToast } from '@/hooks/useToast'
import { useGetMeQuery } from '@/lib/api/authApi'
import {
  useDeleteAdminUserMutation,
  useListAdminUsersQuery,
  useResetAdminUserPasswordMutation,
  type AdminUserListItem,
} from '@/lib/api/adminApi'

const DANGER_BUTTON_CLASS =
  'min-h-9 rounded-md border border-danger-500 px-3 text-sm font-medium text-danger-700 transition-colors hover:bg-danger-500/10 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-500'
const SECONDARY_BUTTON_CLASS =
  'min-h-9 rounded-md border border-border px-3 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'

/**
 * 後台管理（task-037，`→ ADMIN_EMAILS`）：只做查使用者 + 刪使用者 + 重設密碼，不做直接編輯
 * 使用者財務資料（責任歸屬不清，真要修資料回去用 psql，→ 使用者與 assistant 討論後的決議）。
 * 授權以後端 `require_admin`（403）為準，本頁 `me.is_admin` 只做 UX 顯示（→ FE-037）。
 */
function AdminPageContent(): ReactNode {
  const toast = useToast()
  const { data: me } = useGetMeQuery()
  const { data, isLoading, error } = useListAdminUsersQuery()
  const [deleteUser, { isLoading: isDeleting }] = useDeleteAdminUserMutation()
  const [resetPassword, { isLoading: isResetting }] = useResetAdminUserPasswordMutation()

  const [pendingDelete, setPendingDelete] = useState<AdminUserListItem | null>(null)
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null)

  async function handleConfirmDelete(): Promise<void> {
    if (pendingDelete === null) return
    try {
      await deleteUser(pendingDelete.user_uid).unwrap()
      toast.success(`已刪除「${pendingDelete.email}」`)
    } catch {
      toast.error('刪除失敗，請稍後再試')
    }
    setPendingDelete(null)
  }

  async function handleResetPassword(user: AdminUserListItem): Promise<void> {
    try {
      const result = await resetPassword(user.user_uid).unwrap()
      setResetResult({ email: user.email, password: result.temporary_password })
    } catch {
      toast.error('重設密碼失敗，請稍後再試')
    }
  }

  if (me !== undefined && !me.is_admin) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 bg-bg p-6">
        <p role="alert" className="text-danger-700">
          沒有權限存取這個頁面
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 bg-bg p-6">
      <h1 className="text-2xl font-bold text-text-primary md:text-3xl">後台管理</h1>

      {isLoading && <p className="text-text-secondary">載入中…</p>}
      {error && (
        <p role="alert" className="text-sm text-danger-700">
          載入使用者清單失敗
        </p>
      )}

      {data && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">共 {data.total} 位使用者</p>
          {data.items.map((user) => (
            <CurvedCard key={user.user_uid}>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col">
                  <span className="text-base font-medium text-text-primary">{user.email}</span>
                  <span className="text-sm text-text-secondary">
                    {user.account_count} 個帳戶・{user.transaction_count} 筆交易・
                    {new Date(user.created_at).toLocaleDateString('zh-TW')} 註冊
                  </span>
                  <span className="text-sm text-text-secondary">
                    最後登入：
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleString('zh-TW')
                      : '從未登入'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isResetting}
                    aria-label={`重設密碼 ${user.email}`}
                    onClick={() => void handleResetPassword(user)}
                    className={SECONDARY_BUTTON_CLASS}
                  >
                    重設密碼
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    aria-label={`刪除 ${user.email}`}
                    onClick={() => setPendingDelete(user)}
                    className={DANGER_BUTTON_CLASS}
                  >
                    刪除
                  </button>
                </div>
              </div>
            </CurvedCard>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`刪除「${pendingDelete?.email ?? ''}」？`}
        description="軟刪除：該使用者無法再登入，資料不會馬上從資料庫清除"
        confirmLabel={isDeleting ? '刪除中…' : '刪除'}
        destructive
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />

      <Dialog
        open={resetResult !== null}
        onOpenChange={(open) => {
          if (!open) setResetResult(null)
        }}
        title="密碼已重設"
        description={resetResult ? `請透過其他管道告知「${resetResult.email}」這組臨時密碼：` : undefined}
      >
        <div className="flex flex-col gap-4">
          <input
            type="text"
            readOnly
            value={resetResult?.password ?? ''}
            onFocus={(event) => event.target.select()}
            className="min-h-11 rounded-md border border-border bg-surface px-3 font-mono text-text-primary"
          />
          <p className="text-xs text-text-muted">
            這組密碼只會顯示這一次，離開此畫面後無法再次查看；該使用者下次登入會被強制要求改密碼。
          </p>
          <button
            type="button"
            onClick={() => setResetResult(null)}
            className={SECONDARY_BUTTON_CLASS}
          >
            關閉
          </button>
        </div>
      </Dialog>
    </main>
  )
}

export default function AdminPage(): ReactNode {
  return (
    <AuthGuard>
      <AppShell>
        <AdminPageContent />
      </AppShell>
    </AuthGuard>
  )
}
