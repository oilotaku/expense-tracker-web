import type { ReactNode } from 'react'
import { AuthGuard } from '@/components/AuthGuard'
import { TransactionForm } from '@/components/TransactionForm'
import { TransactionList } from '@/components/TransactionList'

export default function TransactionsPage(): ReactNode {
  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 p-6">
        <h1 className="text-2xl font-bold">交易</h1>
        <TransactionForm />
        <TransactionList />
      </main>
    </AuthGuard>
  )
}
