'use client'

import { useState, type ReactNode } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import { AppShell } from '@/components/common/AppShell'
import {
  TransactionFormDialog,
  type TransactionFormValues,
} from '@/components/transactions/TransactionFormDialog'
import { TransactionList } from '@/components/TransactionList'
import { useCreateTransactionMutation, useCreateTransferMutation } from '@/lib/api/transactionsApi'
import { useCreateRecurringRuleMutation } from '@/lib/api/recurringApi'

/**
 * design-spec §9.3/§9.4 + [A12]：「新增收支」不開新路由，由 `<AppShell>` 的 FAB（Dashboard 與
 * 本頁共用同一套觸發方式）開啟本頁持有的 `<TransactionFormDialog mode="create">`；桌機另附一顆
 * 對等的「＋新增交易」按鈕（`<BottomNav>` 的 FAB 只在 `md:hidden` 顯示，→ AppShell.tsx）。
 * [A13]：表單內「固定收支」勾選只是呼叫既有 `recurring_rules` 建立 API 的另一個入口，非重複
 * 實作——`values.recurring` 非 null 時改呼叫 `createRecurringRule`，不建立一次性交易。
 * 轉帳（`values.transaction_type === 'transfer'`）沒有分類/固定收支，改呼叫 `createTransfer`。
 */
export default function TransactionsPage(): ReactNode {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createTransaction] = useCreateTransactionMutation()
  const [createTransfer] = useCreateTransferMutation()
  const [createRecurringRule] = useCreateRecurringRuleMutation()

  async function handleCreateSubmit(values: TransactionFormValues): Promise<void> {
    if (values.transaction_type === 'transfer') {
      await createTransfer({
        from_account_uid: values.from_account_uid,
        to_account_uid: values.to_account_uid,
        transaction_date: values.transaction_date,
        description: values.description,
        amount: values.amount,
        payment_method: values.payment_method,
      }).unwrap()
      return
    }
    if (values.recurring) {
      await createRecurringRule({
        account_uid: values.account_uid,
        category_uid: values.category_uid,
        description: values.description,
        amount: values.amount,
        transaction_type: values.transaction_type,
        payment_method: values.payment_method,
        interval_unit: values.recurring.interval_unit,
        interval_count: values.recurring.interval_count,
        anchor_date: values.recurring.anchor_date,
      }).unwrap()
      return
    }
    await createTransaction({
      account_uid: values.account_uid,
      category_uid: values.category_uid,
      transaction_date: values.transaction_date,
      description: values.description,
      amount: values.amount,
      transaction_type: values.transaction_type,
      payment_method: values.payment_method,
      tags: values.tags,
    }).unwrap()
  }

  return (
    <AuthGuard>
      <AppShell onAddClick={() => setIsCreateOpen(true)}>
        <main className="mx-auto flex max-w-5xl flex-col gap-6 bg-bg p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-text-primary md:text-3xl">交易</h1>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="hidden min-h-11 items-center rounded-md bg-primary-600 px-4 font-medium text-text-inverse transition-colors hover:bg-primary-700 md:inline-flex md:min-h-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
            >
              ＋ 新增交易
            </button>
          </div>
          <TransactionList />
        </main>
      </AppShell>
      <TransactionFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        mode="create"
        onSubmit={handleCreateSubmit}
      />
    </AuthGuard>
  )
}
