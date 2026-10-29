import { createElement, type ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { Provider } from 'react-redux'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { makeStore } from '@/store/store'
import { readMultipart } from '@/test/multipart'
import {
  IconPreviewError,
  iconImageUrl,
  previewIcon,
  useDeleteIconMutation,
  useGetIconUsagesQuery,
  useListIconsQuery,
  useUploadIconMutation,
} from './iconsApi'

const BASE_URL = 'http://localhost:8000/api/v1'

const ICON = {
  user_icon_uid: 'i-1',
  icon_key: 'custom:i-1',
  url: '/api/v1/icons/i-1',
  content_sha256: 'a'.repeat(64),
  byte_size: 1234,
  usage_count: 0,
  created_at: '2026-10-29T16:00:00+08:00',
}

function ok<T>(data: T, responseCode = 200) {
  return HttpResponse.json({ success: true, data, detail: null, response_code: responseCode }, { status: responseCode })
}

// FE-012：一律用 msw 攔截真實 HTTP request
const server = setupServer()

function renderWithStore<T>(useHook: () => T) {
  const store = makeStore()
  // eslint-disable-next-line react/no-children-prop
  const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, { store, children })
  return renderHook(useHook, { wrapper })
}

describe('iconsApi', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('iconImageUrl 依 API base 與 uid 組網址', () => {
    expect(iconImageUrl('abc')).toBe(`${BASE_URL}/icons/abc`)
  })

  it('listIcons：回傳清單與配額', async () => {
    server.use(http.get(`${BASE_URL}/icons`, () => ok({ items: [ICON], quota: { used: 1, limit: 50 } })))
    const { result } = renderWithStore(() => useListIconsQuery())
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.items[0]?.icon_key).toBe('custom:i-1')
    expect(result.current.data?.quota).toEqual({ used: 1, limit: 50 })
  })

  it('uploadIcon：以 multipart 送出圖片與去白底選項', async () => {
    let body: Awaited<ReturnType<typeof readMultipart>> | undefined
    server.use(
      http.post(`${BASE_URL}/icons`, async ({ request }) => {
        body = await readMultipart(request)
        return ok(ICON, 201)
      }),
    )
    const { result } = renderWithStore(() => useUploadIconMutation())
    let uploaded: typeof ICON | undefined
    await act(async () => {
      uploaded = await result.current[0]({
        image: new Blob(['png'], { type: 'image/png' }),
        removeWhiteBackground: true,
      }).unwrap()
    })
    expect(uploaded?.user_icon_uid).toBe('i-1')
    expect(body?.hasFile).toBe(true)
    expect(body?.fields.remove_white_background).toBe('true')
  })

  it('getIconUsages 與 deleteIcon', async () => {
    server.use(
      http.get(`${BASE_URL}/icons/i-1/usages`, () =>
        ok({ accounts: [{ account_uid: 'a-1', name: '現金' }], categories: [] }),
      ),
      http.delete(`${BASE_URL}/icons/i-1`, () => ok({ reset_accounts: 1, reset_categories: 0 })),
    )
    const usages = renderWithStore(() => useGetIconUsagesQuery('i-1'))
    await waitFor(() => expect(usages.result.current.isSuccess).toBe(true))
    expect(usages.result.current.data?.accounts[0]?.name).toBe('現金')

    const deletion = renderWithStore(() => useDeleteIconMutation())
    let reset: { reset_accounts: number; reset_categories: number } | undefined
    await act(async () => {
      reset = await deletion.result.current[0]('i-1').unwrap()
    })
    expect(reset).toEqual({ reset_accounts: 1, reset_categories: 0 })
  })

  it('previewIcon：成功回傳 PNG Blob', async () => {
    server.use(
      http.post(
        `${BASE_URL}/icons/preview`,
        () => new HttpResponse(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } }),
      ),
    )
    const blob = await previewIcon({ image: new Blob(['x']), removeWhiteBackground: false })
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(4)
  })

  it('previewIcon：失敗時錯誤訊息是後端 detail 原文', async () => {
    server.use(
      http.post(`${BASE_URL}/icons/preview`, () =>
        HttpResponse.json(
          { success: false, data: null, detail: '只接受 PNG、JPEG、WebP、GIF', response_code: 422 },
          { status: 422 },
        ),
      ),
    )
    await expect(previewIcon({ image: new Blob(['x']), removeWhiteBackground: false })).rejects.toEqual(
      new IconPreviewError('只接受 PNG、JPEG、WebP、GIF'),
    )
  })
})
