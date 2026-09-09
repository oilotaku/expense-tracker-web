'use client'

import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { AuthGuard } from '@/components/AuthGuard'
import { AppShell } from '@/components/common/AppShell'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CurvedCard } from '@/components/common/CurvedCard'
import { CHART_SWATCH_COLORS, ColorSwatchPicker } from '@/components/common/ColorSwatchPicker'
import { IconPicker } from '@/components/common/IconPicker'
import { CategoryChip } from '@/components/categories/CategoryChip'
import {
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useListCategoriesQuery,
  useUpdateCategoryMutation,
  type CategoryResponse,
} from '@/lib/api/categoriesApi'

// 同 BudgetsPage / AssetsPage（FE-029）：錯誤處理必用型別收窄，禁 `error as any`。本 task
// affected_files 未含共用 utils 檔，依既有慣例在頁面內各自實作（→ budgets/page.tsx 同註解）。
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

const DEFAULT_COLOR = CHART_SWATCH_COLORS[0] ?? '#8B6ED6'
// 對齊後端 Category model 的 icon server_default（backend/app/models/category.py）
const DEFAULT_ICON = 'other'

interface CategoryCreateFormProps {
  existingNames: string[]
}

/**
 * design-spec §8：常駐輸入列「+ 新增分類」，名稱文字輸入與色票 / 圖示選擇器同時展開；重名
 * 比對已載入清單做即時前端驗證，最終仍以後端 409 為準（→ Acceptance）。
 */
function CategoryCreateForm({ existingNames }: CategoryCreateFormProps): ReactNode {
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [icon, setIcon] = useState(DEFAULT_ICON)
  const [createCategory, { isLoading, error }] = useCreateCategoryMutation()

  const trimmedName = name.trim()
  const isDuplicate = trimmedName.length > 0 && existingNames.includes(trimmedName)
  const canSubmit = trimmedName.length > 0 && !isDuplicate

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!canSubmit) return
    try {
      await createCategory({ name: trimmedName, color, icon }).unwrap()
      setName('')
      setColor(DEFAULT_COLOR)
      setIcon(DEFAULT_ICON)
    } catch {
      // 錯誤已透過 createCategory() 的 error 狀態顯示，這裡只需擋掉 unwrap() 的 rejection
    }
  }

  return (
    <CurvedCard>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <h2 className="text-lg font-semibold text-text-primary">新增分類</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-secondary">名稱</span>
          <input
            type="text"
            required
            maxLength={50}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-surface px-3 text-text-primary"
          />
        </label>
        {isDuplicate && (
          <p role="alert" className="text-sm text-danger-700">
            已存在同名分類
          </p>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-sm text-text-secondary">顏色</span>
          <ColorSwatchPicker value={color} onChange={setColor} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm text-text-secondary">圖示</span>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {getErrorMessage(error)}
          </p>
        )}
        <button
          type="submit"
          disabled={isLoading || !canSubmit}
          className="min-h-11 rounded-md bg-primary-600 px-4 font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          {isLoading ? '新增中…' : '+ 新增分類'}
        </button>
      </form>
    </CurvedCard>
  )
}

interface CategoryGridProps {
  categories: CategoryResponse[]
  isLoading: boolean
  error: FetchBaseQueryError | SerializedError | undefined
}

/**
 * design-spec §8：桌機四欄 grid + hover 顯示刪除、行動端兩欄 grid + 長按顯示刪除
 * （長按互動實作在 <CategoryChip> 內）；刪除走 <ConfirmDialog>，不影響既有交易紀錄。
 */
function CategoryGrid({ categories, isLoading, error }: CategoryGridProps): ReactNode {
  const [updateCategory] = useUpdateCategoryMutation()
  const [deleteCategory, { isLoading: isDeleting }] = useDeleteCategoryMutation()
  const [pendingDelete, setPendingDelete] = useState<CategoryResponse | null>(null)

  function handleColorChange(categoryUid: string, color: string): void {
    void updateCategory({ categoryUid, color })
  }

  function handleIconChange(categoryUid: string, icon: string): void {
    void updateCategory({ categoryUid, icon })
  }

  async function handleConfirmDelete(): Promise<void> {
    if (pendingDelete === null) return
    try {
      await deleteCategory(pendingDelete.category_uid).unwrap()
    } catch {
      // 刪除失敗（如後端有其他保護邏輯）維持既有清單顯示，本版不改刪除邏輯，錯誤不額外攔截
    }
    setPendingDelete(null)
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text-primary">分類清單</h2>
      {isLoading && <p className="text-text-secondary">載入中…</p>}
      {error && (
        <p role="alert" className="text-sm text-danger-700">
          {getErrorMessage(error)}
        </p>
      )}
      {!isLoading && !error && categories.length === 0 && (
        <p className="text-text-secondary">尚未建立任何分類</p>
      )}
      {!isLoading && !error && categories.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {categories.map((category) => (
            <CategoryChip
              key={category.category_uid}
              category={category}
              onColorChange={handleColorChange}
              onIconChange={handleIconChange}
              onRequestDelete={setPendingDelete}
            />
          ))}
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`刪除「${pendingDelete?.name ?? ''}」？`}
        description="刪除後不影響既有交易紀錄，但無法用此分類建立新交易"
        confirmLabel={isDeleting ? '刪除中…' : '刪除'}
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  )
}

export default function CategoriesPage(): ReactNode {
  const { data, isLoading, error } = useListCategoriesQuery()
  const categories = useMemo(() => data?.items ?? [], [data])
  const existingNames = useMemo(() => categories.map((category) => category.name), [categories])

  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 bg-bg p-6">
          <h1 className="text-2xl font-bold text-text-primary md:text-3xl">分類管理</h1>
          <CategoryCreateForm existingNames={existingNames} />
          <CategoryGrid categories={categories} isLoading={isLoading} error={error} />
        </main>
      </AppShell>
    </AuthGuard>
  )
}
