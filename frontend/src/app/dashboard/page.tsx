'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDispatch } from 'react-redux'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { AuthGuard } from '@/components/AuthGuard'
import { AppShell } from '@/components/common/AppShell'
import { CurvedCard } from '@/components/common/CurvedCard'
import { Dialog } from '@/components/common/Dialog'
import { CategoryBarChart } from '@/components/dashboard/CategoryBarChart'
import { CategoryPieChart, type CategorySlice } from '@/components/dashboard/CategoryPieChart'
import { ChartTypeSwitcher, type ChartType } from '@/components/dashboard/ChartTypeSwitcher'
import { NetWorthCard } from '@/components/dashboard/NetWorthCard'
import {
  PeriodSelector,
  defaultPeriodSelection,
  toPeriodRange,
  type PeriodSelection,
} from '@/components/dashboard/PeriodSelector'
import { StatTile, formatAmount } from '@/components/dashboard/StatTile'
import { TrendLineChart, type TrendPoint } from '@/components/dashboard/TrendLineChart'
import {
  TransactionFormDialog,
  type TransactionFormValues,
} from '@/components/transactions/TransactionFormDialog'
import { useListAccountsQuery } from '@/lib/api/accountsApi'
import { useGetNetWorthQuery } from '@/lib/api/assetsApi'
import { useGetMeQuery } from '@/lib/api/authApi'
import { baseApi } from '@/lib/api/baseApi'
import {
  useGetCategoryBreakdownQuery,
  useGetDashboardSummaryQuery,
  useGetDashboardTrendQuery,
} from '@/lib/api/dashboardApi'
import { useCreateRecurringRuleMutation } from '@/lib/api/recurringApi'
import {
  useCreateTransactionMutation,
  useCreateTransferMutation,
  useListCategoryOptionsQuery,
  useListTransactionsQuery,
  type TransactionResponse,
} from '@/lib/api/transactionsApi'
import type { AppDispatch } from '@/store/store'

// 同 AccountsPage / BudgetsPage（FE-029）：錯誤處理必用型別收窄，禁 `error as any`。
function getErrorMessage(error: FetchBaseQueryError | SerializedError | undefined): string {
  if (!error) return ''
  if ('status' in error) {
    const data = error.data
    if (
      data !== null &&
      typeof data === 'object' &&
      'detail' in data &&
      typeof data.detail === 'string'
    ) {
      return data.detail
    }
    return '發生錯誤，請稍後再試'
  }
  return error.message ?? '發生錯誤，請稍後再試'
}

// 四張卡片與期間切換吃 `GET /dashboard/summary`（→ design-spec §9.2 資料源決議 / A14），圖表區的
// 「分類佔比」與「收支趨勢」吃 `GET /dashboard/category-breakdown` / `GET /dashboard/trend`
// （後端 SQL 彙總 + 換算 TWD，沒有 `GET /transactions` 那種 limit 上限，取代舊版前端吃
// `useListTransactionsQuery(limit=100)` 自算、超過 100 筆交易時資料不完整的做法）。
const RECENT_TRANSACTION_LIMIT = 5

// PIN 快速登入提醒：只在「註冊後的首次登入」（登入頁帶來的 `?justRegistered=1`）出現，且同一
// 瀏覽器每個帳號最多出現一次 —— 不是「只要沒設 PIN 就提醒」，否則會一直騷擾刻意不設的使用者。
// 依 user_uid 分開記，慣例同 settings/page.tsx 的 `pin-status:${userUid}`。
function pinReminderStorageKey(userUid: string): string {
  return `pin-reminder-shown:${userUid}`
}

function hasSeenPinReminder(userUid: string): boolean {
  try {
    return window.localStorage.getItem(pinReminderStorageKey(userUid)) === 'shown'
  } catch {
    return false
  }
}

function markPinReminderShown(userUid: string): void {
  try {
    window.localStorage.setItem(pinReminderStorageKey(userUid), 'shown')
  } catch {
    // 私密瀏覽模式等寫入失敗場景降級為「下次可能再出現一次」，不影響本次操作（同 settings/page.tsx）
  }
}

const PIN_REMINDER_PRIMARY_BUTTON_CLASS =
  'min-h-11 rounded-md bg-primary-600 px-4 font-medium text-text-inverse transition-colors hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'
const PIN_REMINDER_SECONDARY_BUTTON_CLASS =
  'min-h-11 rounded-md border border-border px-4 font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'

// 分類佔比/收支趨勢圖表資料由後端彙總 API 直接算好並換算成 TWD（→ GET /dashboard/category-breakdown
// / GET /dashboard/trend，backend/app/services/dashboard_service.py），前端只需把字串金額轉成
// number 餵給圖表元件（`categorySlices`/`trendPoints`，見 DashboardContent），不再需要在前端
// 逐筆加總或換算幣別。

// transaction_date 為帶 offset 的 ISO 8601（後端已序列化為 API_TZ，→ CORE-041），前端不再轉換，
// 直接取字串的月/日呈現（design-spec §9.2 wireframe 的 `09/03`）。
function toDisplayDate(isoDate: string): string {
  return isoDate.slice(5, 10).replace('-', '/')
}

const CHART_FORMAT_VALUE = (amount: number): string => formatAmount(String(amount))

// FE-052：條件樣式改走 cva variant，不在 JSX 內串三元 class。轉帳不是收入也不是支出，
// 用中性色（同 TransactionList.tsx 轉帳列的既有配色決定）。
const transactionAmountClassName = cva('shrink-0 text-sm font-semibold tabular-nums md:text-base', {
  variants: {
    transactionType: {
      income: 'text-income-700',
      expense: 'text-expense-700',
      transfer: 'text-text-primary',
    },
  },
  defaultVariants: { transactionType: 'expense' },
})

// 支出在清單一律顯示負號、收入顯示正號（design-spec §9.2 wireframe `-NT$120` / `+NT$45,000`）；
// 轉帳兩邊帳戶互相抵銷、不是真正的增減，不加正負號。
//
// 外幣帳戶功能：一筆交易的金額是「該筆交易所屬帳戶」的原生幣別，不能一律假設 NT$（→
// NetWorthCard.tsx 帳戶總覽同一類 bug 的修法），故不走 formatAmount（固定 NT$ 前綴），
// 改用相同的千分位規則但換成呼叫端傳入的實際幣別代碼。
function signedTransactionAmount(transaction: TransactionResponse, currency: string): string {
  const amount = Number(transaction.amount)
  if (!Number.isFinite(amount)) return `${transaction.amount} ${currency}`
  const absolute = amount.toLocaleString('zh-Hant-TW', { maximumFractionDigits: 0 })
  if (transaction.transaction_type === 'transfer') return `${absolute} ${currency}`
  const sign = transaction.transaction_type === 'income' ? '+' : '-'
  return `${sign}${absolute} ${currency}`
}

/**
 * 註冊後首次登入才出現的 PIN 快速登入提醒（見上方 pinReminderStorageKey 註解）。
 * 刻意做成獨立元件並放在 <AuthGuard> 之內才 mount：`me` 因此在首次 render 就已就緒，
 * 「要不要顯示」可以一次算完（同 settings/page.tsx 讀本機 PIN 狀態的慣例）。
 */
function PinSetupReminder(): ReactNode {
  const router = useRouter()
  const searchParams = useSearchParams()
  // AuthGuard 已呼叫過同一支 query，這裡取的是 RTK Query 快取，不會多打一次 API
  const { data: me } = useGetMeQuery()
  const userUid = me?.user_uid ?? ''
  const justRegistered = searchParams.get('justRegistered') === '1'

  const [isOpen, setIsOpen] = useState<boolean>(
    () => justRegistered && userUid !== '' && !hasSeenPinReminder(userUid),
  )

  useEffect(() => {
    // 顯示的當下就記錄，不等使用者按按鈕：直接關掉分頁或跳走也算「已經提醒過」
    if (isOpen) markPinReminderShown(userUid)
  }, [isOpen, userUid])

  useEffect(() => {
    // 訊號用過即清掉網址上的 query param，避免重新整理或分享網址時再次帶入
    if (justRegistered) router.replace('/dashboard')
  }, [justRegistered, router])

  function handleSetUp(): void {
    setIsOpen(false)
    // PIN 設定流程已完整實作在設定頁（design-spec §9.7），這裡只負責把使用者帶過去
    router.push('/settings')
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={setIsOpen}
      title="要設定 PIN 快速登入嗎？"
      description="設定 6 碼 PIN 後，下次在這台裝置就能免密碼登入。也可以之後再到「設定」開啟。"
    >
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <button type="button" onClick={handleSetUp} className={PIN_REMINDER_PRIMARY_BUTTON_CLASS}>
          立即設定
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className={PIN_REMINDER_SECONDARY_BUTTON_CLASS}
        >
          稍後再說
        </button>
      </div>
    </Dialog>
  )
}

function DashboardContent(): ReactNode {
  const router = useRouter()
  const dispatch = useDispatch<AppDispatch>()

  const [selection, setSelection] = useState<PeriodSelection>(defaultPeriodSelection)
  const [isFormOpen, setIsFormOpen] = useState(false)

  const range = useMemo(() => toPeriodRange(selection), [selection])

  const {
    data: summary,
    isLoading: isSummaryLoading,
    error: summaryError,
  } = useGetDashboardSummaryQuery({
    period: selection.period,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  })

  const { data: categoryBreakdown } = useGetCategoryBreakdownQuery({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  })
  const { data: trend } = useGetDashboardTrendQuery({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  })
  const { data: recentTransactions } = useListTransactionsQuery({ limit: RECENT_TRANSACTION_LIMIT })
  const { data: categories } = useListCategoryOptionsQuery()
  const { data: accountList } = useListAccountsQuery()
  const {
    data: netWorth,
    isLoading: isNetWorthLoading,
    error: netWorthError,
    refetch: refetchNetWorth,
  } = useGetNetWorthQuery()

  const [createTransaction] = useCreateTransactionMutation()
  const [createTransfer] = useCreateTransferMutation()
  const [createRecurringRule] = useCreateRecurringRuleMutation()

  const accounts = useMemo(() => accountList?.items ?? [], [accountList])
  const categoryNames = useMemo(
    () => new Map((categories ?? []).map((category) => [category.category_uid, category.name])),
    [categories],
  )
  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.account_uid, account.name])),
    [accounts],
  )
  const accountCurrencies = useMemo(
    () => new Map(accounts.map((account) => [account.account_uid, account.currency])),
    [accounts],
  )
  const categorySlices = useMemo(
    (): CategorySlice[] =>
      (categoryBreakdown?.items ?? []).map((item) => ({
        id: item.category_uid,
        label: categoryNames.get(item.category_uid) ?? '未分類',
        amount: Number(item.amount),
      })),
    [categoryBreakdown, categoryNames],
  )
  const trendPoints = useMemo(
    (): TrendPoint[] =>
      (trend?.items ?? []).map((point) => ({
        date: point.date,
        income: Number(point.income),
        expense: Number(point.expense),
      })),
    [trend],
  )

  // 期間 = 年 / 自訂範圍時後端一律回 `budget_remaining: null`（→ A7），卡片改顯示灰階簡化狀態。
  const isBudgetAvailable =
    selection.period === 'month' && summary?.budget_remaining !== null && summary?.budget_remaining !== undefined

  const openForm = useCallback((): void => setIsFormOpen(true), [])

  function handleLogout(): void {
    // 已知後端缺口（同 settings/page.tsx 註解）：backend 尚無 POST /auth/logout，httpOnly cookie
    // 無法在前端清除；這裡只清空 RTK Query 快取並導回登入頁，需後端補 endpoint 才能完整解決。
    dispatch(baseApi.util.resetApiState())
    router.push('/login')
  }

  async function handleSubmitTransaction(values: TransactionFormValues): Promise<void> {
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
    const { recurring, ...payload } = values
    await createTransaction(payload).unwrap()
    // 「固定收支」勾選 = 呼叫既有 recurring_rules 建立 API 的另一個入口（→ A13）。
    if (recurring) {
      await createRecurringRule({
        account_uid: payload.account_uid,
        category_uid: payload.category_uid,
        description: payload.description,
        amount: payload.amount,
        transaction_type: payload.transaction_type,
        payment_method: payload.payment_method,
        interval_unit: recurring.interval_unit,
        interval_count: recurring.interval_count,
        anchor_date: recurring.anchor_date,
      }).unwrap()
    }
  }

  function renderChart(chartType: ChartType): ReactNode {
    if (chartType === 'line') {
      return <TrendLineChart data={trendPoints} formatValue={CHART_FORMAT_VALUE} />
    }
    if (chartType === 'bar') {
      return <CategoryBarChart data={categorySlices} formatValue={CHART_FORMAT_VALUE} />
    }
    return <CategoryPieChart data={categorySlices} formatValue={CHART_FORMAT_VALUE} />
  }

  return (
    <AuthGuard>
      <AppShell onAddClick={openForm} onLogout={handleLogout}>
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:gap-8 md:px-6 lg:px-8">
          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-2xl font-bold text-text-primary md:text-3xl">總覽</h1>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <PeriodSelector value={selection} onChange={setSelection} />
              {/* 行動端的新增入口是 <BottomNav> 中央 FAB（AppShell 的 onAddClick），
                  桌機另備 Header 按鈕（design-spec §9.2 `[＋新增]`）。 */}
              <button
                type="button"
                onClick={openForm}
                className="hidden min-h-9 items-center rounded-md bg-primary-600 px-4 font-medium text-text-inverse transition-colors hover:bg-primary-700 md:inline-flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                ＋ 新增交易
              </button>
            </div>
          </header>

          {summaryError && (
            <p role="alert" className="text-sm text-danger-700">
              {getErrorMessage(summaryError)}
            </p>
          )}

          {isSummaryLoading && <p className="text-text-secondary">載入中…</p>}

          {!isSummaryLoading && !summaryError && (
            // 行動端垂直堆疊、結餘拉大成 Hero 並置頂（order-first）；桌機 grid-cols-4 四張並排
            // （design-spec §9.2 RWD 對應）。切版全部走 Tailwind class，無 JS 判斷（→ FE-063）。
            <section aria-label="期間彙總" className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
              <StatTile label="收入" value={summary?.income ?? '0'} tone="income" />
              <StatTile label="支出" value={summary?.expense ?? '0'} tone="expense" />
              <StatTile
                label="結餘"
                value={summary?.balance ?? '0'}
                tone="neutral"
                signed
                hero
                className="order-first col-span-2 md:order-none md:col-span-1"
              />
              <StatTile
                label="預算結餘"
                value={summary?.budget_remaining ?? '0'}
                tone="warning"
                unavailable={!isBudgetAvailable}
                hint={isBudgetAvailable ? undefined : '預算僅支援月度檢視'}
                className="col-span-2 md:col-span-1"
              />
            </section>
          )}

          <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
            <CurvedCard className="flex flex-col gap-4 lg:col-span-2">
              <h2 className="text-xl font-semibold text-text-primary md:text-2xl">支出分類</h2>
              <ChartTypeSwitcher renderChart={renderChart} />
            </CurvedCard>

            <NetWorthCard
              accounts={accounts}
              netWorth={netWorth}
              isLoading={isNetWorthLoading}
              error={netWorthError}
              onRetry={() => {
                void refetchNetWorth()
              }}
            />
          </div>

          <CurvedCard className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold text-text-primary md:text-2xl">最近交易</h2>
              <Link
                href="/transactions"
                className="text-sm font-medium text-primary-600 hover:text-primary-700 md:text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                查看全部 →
              </Link>
            </div>
            {(recentTransactions?.items ?? []).length === 0 ? (
              <p className="text-sm text-text-secondary md:text-base">尚無交易紀錄</p>
            ) : (
              <ul className="flex flex-col gap-3" role="list">
                {(recentTransactions?.items ?? []).map((transaction) => (
                  <li key={transaction.transaction_uid} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-text-primary md:text-base">
                        {toDisplayDate(transaction.transaction_date)}{' '}
                        {transaction.transaction_type === 'transfer'
                          ? `轉帳 → ${
                              accountNames.get(transaction.transfer_counterpart_account_uid ?? '') ??
                              '未知帳戶'
                            }`
                          : (categoryNames.get(transaction.category_uid ?? '') ?? '未分類')}
                      </span>
                      <span className="truncate text-xs text-text-muted">
                        {[transaction.description, accountNames.get(transaction.account_uid)]
                          .filter((part) => part !== undefined && part.length > 0)
                          .join(' · ')}
                      </span>
                    </span>
                    <span
                      className={transactionAmountClassName({
                        transactionType: transaction.transaction_type,
                      })}
                    >
                      {signedTransactionAmount(
                        transaction,
                        accountCurrencies.get(transaction.account_uid) ?? '',
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CurvedCard>
        </div>

        <TransactionFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} onSubmit={handleSubmitTransaction} />
        <PinSetupReminder />
      </AppShell>
    </AuthGuard>
  )
}

// `useSearchParams()` 在靜態預渲染時必須包在 Suspense 邊界內（Next.js
// missing-suspense-with-csr-bailout），故 page 元件只負責邊界，畫面本體在 <DashboardContent>。
export default function DashboardPage(): ReactNode {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  )
}
