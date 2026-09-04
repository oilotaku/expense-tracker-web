import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { Provider } from 'react-redux'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { makeStore } from '@/store/store'
import {
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useListCategoriesQuery,
  useUpdateCategoryMutation,
} from './categoriesApi'

// resolveApiBaseUrl()：jsdom 環境 window 已定義（非 server），且測試未設 NEXT_PUBLIC_API_URL，
// 故落回 baseApi.ts 的 FALLBACK 常數。
const BASE_URL = 'http://localhost:8000/api/v1'
const CATEGORIES_URL = `${BASE_URL}/categories`

const SUBSCRIPTION_CATEGORY = {
  category_uid: 'c-subscription',
  name: '訂閱',
  color: '#3E8FD0',
  icon: 'subscription',
}

const LIST_DATA = { items: [SUBSCRIPTION_CATEGORY], total: 1 }

// FE-012：一律用 msw 攔截真實 HTTP request，禁 mock fetch / RTK hook 本身
const server = setupServer()

function renderWithStore<T>(useHook: () => T) {
  const store = makeStore()
  // react-redux 的 ProviderProps.children 是必要欄位（非 JSX rest-args 特例合併），檔案為
  // .test.ts（affected_files 規定）不能用 JSX，只能顯式帶 children prop。
  // eslint-disable-next-line react/no-children-prop
  const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, { store, children })
  return renderHook(useHook, { wrapper })
}

describe('categoriesApi', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('listCategories：成功時回傳 unwrap 後含「訂閱」分類的清單，並帶 limit=100 查詢字串', async () => {
    let capturedUrl: URL | undefined
    server.use(
      http.get(CATEGORIES_URL, ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json({ success: true, data: LIST_DATA, detail: null, response_code: 200 })
      }),
    )

    const { result } = renderWithStore(() => useListCategoriesQuery())

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(LIST_DATA)
    expect(result.current.data?.items[0]?.color).toBe('#3E8FD0')
    expect(result.current.data?.items[0]?.icon).toBe('subscription')
    expect(capturedUrl?.searchParams.get('limit')).toBe('100')
  })

  it('createCategory：成功時回傳 unwrap 後的新分類，POST body 帶 name/color/icon', async () => {
    let capturedBody: unknown
    server.use(
      http.post(CATEGORIES_URL, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(
          { success: true, data: SUBSCRIPTION_CATEGORY, detail: null, response_code: 201 },
          { status: 201 },
        )
      }),
    )

    const { result } = renderWithStore(() => useCreateCategoryMutation())
    const [createCategory] = result.current

    const response = await createCategory({ name: '訂閱', color: '#3E8FD0', icon: 'subscription' }).unwrap()

    expect(response).toEqual(SUBSCRIPTION_CATEGORY)
    expect(capturedBody).toEqual({ name: '訂閱', color: '#3E8FD0', icon: 'subscription' })
  })

  it('createCategory：後端 409（重名）時 hook 回報對應錯誤狀態與訊息', async () => {
    server.use(
      http.post(CATEGORIES_URL, () =>
        HttpResponse.json(
          { success: false, data: null, detail: '已存在同名分類', response_code: 409 },
          { status: 409 },
        ),
      ),
    )

    const { result } = renderWithStore(() => useCreateCategoryMutation())
    const [createCategory] = result.current

    await expect(createCategory({ name: '訂閱', color: '#3E8FD0', icon: 'subscription' }).unwrap()).rejects.toMatchObject(
      { status: 409, data: { detail: '已存在同名分類' } },
    )
  })

  it('updateCategory：PATCH /categories/{category_uid}，body 只帶有變更的欄位', async () => {
    let capturedUrl: string | undefined
    let capturedBody: unknown
    server.use(
      http.patch(`${CATEGORIES_URL}/:categoryUid`, async ({ request, params }) => {
        capturedUrl = params.categoryUid as string
        capturedBody = await request.json()
        return HttpResponse.json({
          success: true,
          data: { ...SUBSCRIPTION_CATEGORY, color: '#D65FA0' },
          detail: null,
          response_code: 200,
        })
      }),
    )

    const { result } = renderWithStore(() => useUpdateCategoryMutation())
    const [updateCategory] = result.current

    const response = await updateCategory({ categoryUid: 'c-subscription', color: '#D65FA0' }).unwrap()

    expect(capturedUrl).toBe('c-subscription')
    expect(capturedBody).toEqual({ color: '#D65FA0' })
    expect(response.color).toBe('#D65FA0')
  })

  it('deleteCategory：成功時（ApiResponse[None]）hook 回傳 undefined，不因 data 為 null 判為錯誤', async () => {
    server.use(
      http.delete(`${CATEGORIES_URL}/:categoryUid`, () =>
        HttpResponse.json({ success: true, data: null, detail: null, response_code: 200 }),
      ),
    )

    const { result } = renderWithStore(() => useDeleteCategoryMutation())
    const [deleteCategory] = result.current

    await expect(deleteCategory('c-subscription').unwrap()).resolves.toBeUndefined()
  })
})
