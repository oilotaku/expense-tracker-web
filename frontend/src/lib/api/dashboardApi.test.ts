import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { Provider } from 'react-redux'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { makeStore } from '@/store/store'
import { useGetDashboardSummaryQuery } from './dashboardApi'

// resolveApiBaseUrl()：jsdom 環境 window 已定義（非 server），且測試未設 NEXT_PUBLIC_API_URL，
// 故落回 baseApi.ts 的 FALLBACK 常數。
const BASE_URL = 'http://localhost:8000/api/v1'
const SUMMARY_URL = `${BASE_URL}/dashboard/summary`

const REQUEST = { period: 'month' as const, dateFrom: '2026-09-01T00:00:00+08:00', dateTo: '2026-09-30T23:59:59+08:00' }

const SUCCESS_DATA = {
  period: 'month',
  date_from: '2026-09-01T00:00:00+08:00',
  date_to: '2026-09-30T23:59:59+08:00',
  income: '50000.00',
  expense: '32000.00',
  balance: '18000.00',
  budget_remaining: '5000.00',
}

// FE-012：一律用 msw 攔截真實 HTTP request，禁 mock fetch / RTK hook 本身
const server = setupServer(
  http.get(SUMMARY_URL, () => HttpResponse.json({ success: true, data: SUCCESS_DATA, detail: null, response_code: 200 })),
)

function renderDashboardSummaryHook(request: typeof REQUEST) {
  const store = makeStore()
  // react-redux 的 ProviderProps.children 是必要欄位（非 JSX rest-args 特例合併），
  // 檔案為 .test.ts（affected_files 規定）不能用 JSX，只能顯式帶 children prop。
  // eslint-disable-next-line react/no-children-prop
  const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, { store, children })
  return renderHook(() => useGetDashboardSummaryQuery(request), { wrapper })
}

describe('dashboardApi', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('成功時回傳 unwrap 後的彙總資料，並帶正確 query string', async () => {
    let capturedUrl: URL | undefined
    server.use(
      http.get(SUMMARY_URL, ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json({ success: true, data: SUCCESS_DATA, detail: null, response_code: 200 })
      }),
    )

    const { result } = renderDashboardSummaryHook(REQUEST)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(SUCCESS_DATA)
    expect(capturedUrl?.searchParams.get('period')).toBe('month')
    expect(capturedUrl?.searchParams.get('date_from')).toBe(REQUEST.dateFrom)
    expect(capturedUrl?.searchParams.get('date_to')).toBe(REQUEST.dateTo)
  })

  it('422（date_to < date_from 驗證失敗）時 hook 回報對應錯誤狀態', async () => {
    server.use(
      http.get(SUMMARY_URL, () =>
        HttpResponse.json(
          { success: false, data: null, detail: '輸入驗證失敗', response_code: 422 },
          { status: 422 },
        ),
      ),
    )

    const { result } = renderDashboardSummaryHook(REQUEST)

    await waitFor(() => expect(result.current.isError).toBe(true))

    const error = result.current.error
    expect(error && 'status' in error && error.status).toBe(422)
    expect(error && 'data' in error && (error.data as { detail: string }).detail).toBe('輸入驗證失敗')
  })

  it('401（未登入）時 hook 回報對應錯誤狀態', async () => {
    server.use(
      http.get(SUMMARY_URL, () =>
        HttpResponse.json({ success: false, data: null, detail: '未登入', response_code: 401 }, { status: 401 }),
      ),
    )

    const { result } = renderDashboardSummaryHook(REQUEST)

    await waitFor(() => expect(result.current.isError).toBe(true))

    const error = result.current.error
    expect(error && 'status' in error && error.status).toBe(401)
    expect(error && 'data' in error && (error.data as { detail: string }).detail).toBe('未登入')
  })
})
