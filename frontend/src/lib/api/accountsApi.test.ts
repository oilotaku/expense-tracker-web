import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { Provider } from 'react-redux'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { makeStore } from '@/store/store'
import {
  useCreateAccountMutation,
  useDeleteAccountMutation,
  useListAccountsQuery,
  useUpdateAccountMutation,
} from './accountsApi'

// resolveApiBaseUrl()：jsdom 環境 window 已定義（非 server），且測試未設 NEXT_PUBLIC_API_URL，
// 故落回 baseApi.ts 的 FALLBACK 常數。
const BASE_URL = 'http://localhost:8000/api/v1'
const ACCOUNTS_URL = `${BASE_URL}/accounts`

const CASH_ACCOUNT = {
  account_uid: 'a-cash',
  name: '現金',
  balance: '1000.00',
  currency: 'TWD',
  color: '#8B6ED6',
  icon: 'wallet',
}

const LIST_DATA = { items: [CASH_ACCOUNT], total: 1 }

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

describe('accountsApi', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('listAccounts：成功時回傳 unwrap 後含帳戶的清單，含 color/icon', async () => {
    server.use(
      http.get(ACCOUNTS_URL, () =>
        HttpResponse.json({ success: true, data: LIST_DATA, detail: null, response_code: 200 }),
      ),
    )

    const { result } = renderWithStore(() => useListAccountsQuery())

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(LIST_DATA)
    expect(result.current.data?.items[0]?.color).toBe('#8B6ED6')
    expect(result.current.data?.items[0]?.icon).toBe('wallet')
  })

  it('createAccount：成功時回傳 unwrap 後的新帳戶，POST body 帶 name/balance/color/icon', async () => {
    let capturedBody: unknown
    server.use(
      http.post(ACCOUNTS_URL, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(
          { success: true, data: CASH_ACCOUNT, detail: null, response_code: 201 },
          { status: 201 },
        )
      }),
    )

    const { result } = renderWithStore(() => useCreateAccountMutation())
    const [createAccount] = result.current

    const response = await createAccount({
      name: '現金',
      balance: '1000.00',
      color: '#8B6ED6',
      icon: 'wallet',
      currency: 'TWD',
    }).unwrap()

    expect(response).toEqual(CASH_ACCOUNT)
    expect(capturedBody).toEqual({
      name: '現金',
      balance: '1000.00',
      color: '#8B6ED6',
      icon: 'wallet',
      currency: 'TWD',
    })
  })

  it('updateAccount：PATCH /accounts/{account_uid}，body 只帶有變更的欄位（改名）', async () => {
    let capturedUrl: string | undefined
    let capturedBody: unknown
    server.use(
      http.patch(`${ACCOUNTS_URL}/:accountUid`, async ({ request, params }) => {
        capturedUrl = params.accountUid as string
        capturedBody = await request.json()
        return HttpResponse.json({
          success: true,
          data: { ...CASH_ACCOUNT, name: '皮夾' },
          detail: null,
          response_code: 200,
        })
      }),
    )

    const { result } = renderWithStore(() => useUpdateAccountMutation())
    const [updateAccount] = result.current

    const response = await updateAccount({ accountUid: 'a-cash', name: '皮夾' }).unwrap()

    expect(capturedUrl).toBe('a-cash')
    expect(capturedBody).toEqual({ name: '皮夾' })
    expect(response.name).toBe('皮夾')
  })

  it('updateAccount：PATCH 只帶 color（改色）', async () => {
    let capturedBody: unknown
    server.use(
      http.patch(`${ACCOUNTS_URL}/:accountUid`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({
          success: true,
          data: { ...CASH_ACCOUNT, color: '#D65FA0' },
          detail: null,
          response_code: 200,
        })
      }),
    )

    const { result } = renderWithStore(() => useUpdateAccountMutation())
    const [updateAccount] = result.current

    const response = await updateAccount({ accountUid: 'a-cash', color: '#D65FA0' }).unwrap()

    expect(capturedBody).toEqual({ color: '#D65FA0' })
    expect(response.color).toBe('#D65FA0')
  })

  it('createAccount：後端 4xx 時 hook 回報對應錯誤狀態與訊息', async () => {
    server.use(
      http.post(ACCOUNTS_URL, () =>
        HttpResponse.json(
          { success: false, data: null, detail: 'color 格式錯誤，需為 #RRGGBB', response_code: 422 },
          { status: 422 },
        ),
      ),
    )

    const { result } = renderWithStore(() => useCreateAccountMutation())
    const [createAccount] = result.current

    await expect(
      createAccount({ name: '現金', balance: '0.00', color: 'bad', icon: 'wallet', currency: 'TWD' }).unwrap(),
    ).rejects.toMatchObject({ status: 422, data: { detail: 'color 格式錯誤，需為 #RRGGBB' } })
  })

  it('deleteAccount：成功時（ApiResponse[None]）hook 回傳 undefined，不因 data 為 null 判為錯誤', async () => {
    server.use(
      http.delete(`${ACCOUNTS_URL}/:accountUid`, () =>
        HttpResponse.json({ success: true, data: null, detail: null, response_code: 200 }),
      ),
    )

    const { result } = renderWithStore(() => useDeleteAccountMutation())
    const [deleteAccount] = result.current

    await expect(deleteAccount('a-cash').unwrap()).resolves.toBeUndefined()
  })
})
