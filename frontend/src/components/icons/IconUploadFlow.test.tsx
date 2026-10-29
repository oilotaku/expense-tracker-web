import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { Provider } from 'react-redux'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeStore } from '@/store/store'
import { readMultipart } from '@/test/multipart'
import { IconUploadFlow } from './IconUploadFlow'

const BASE_URL = 'http://localhost:8000/api/v1'
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const ICON = {
  user_icon_uid: 'i-9',
  icon_key: 'custom:i-9',
  url: '/api/v1/icons/i-9',
  content_sha256: 'b'.repeat(64),
  byte_size: 8,
  usage_count: 0,
  created_at: '2026-10-29T16:00:00+08:00',
}

// 真實 HTTP 走 msw（→ FE-012）；預覽與上傳都要帶同一份檔案與同一組選項
const server = setupServer()
const previewFlags: (string | null)[] = []
const uploadFlags: (string | null)[] = []

function stubBrowserApis(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      matches: false,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
  let n = 0
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:test/${++n}`, revokeObjectURL: () => {} }))
}

function renderFlow(onUploaded = vi.fn()) {
  render(
    <Provider store={makeStore()}>
      <IconUploadFlow variant="dropzone" onUploaded={onUploaded} />
    </Provider>,
  )
  return onUploaded
}

function chooseFile(): void {
  const file = new File([PNG_BYTES], 'bill.png', { type: 'image/png' })
  fireEvent.change(screen.getByTestId('icon-file-input'), { target: { files: [file] } })
}

describe('IconUploadFlow', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    stubBrowserApis()
    previewFlags.length = 0
    uploadFlags.length = 0
    server.use(
      http.post(`${BASE_URL}/icons/preview`, async ({ request }) => {
        previewFlags.push((await readMultipart(request)).fields.remove_white_background ?? null)
        return new HttpResponse(PNG_BYTES, { headers: { 'Content-Type': 'image/png' } })
      }),
      http.post(`${BASE_URL}/icons`, async ({ request }) => {
        uploadFlags.push((await readMultipart(request)).fields.remove_white_background ?? null)
        return HttpResponse.json({ success: true, data: ICON, detail: null, response_code: 201 }, { status: 201 })
      }),
    )
  })
  afterEach(() => {
    server.resetHandlers()
    vi.unstubAllGlobals()
  })
  afterAll(() => server.close())

  it('選圖後先預覽，切換去白底重新預覽，確認後以相同選項上傳', async () => {
    const onUploaded = renderFlow()
    chooseFile()

    expect(await screen.findByText('預覽圖示')).toBeInTheDocument()
    expect(await screen.findByAltText('處理後的圖示')).toBeInTheDocument()
    expect(previewFlags).toEqual(['false'])
    expect(screen.getByTestId('preview-light')).toBeInTheDocument()
    expect(screen.getByTestId('preview-dark')).toBeInTheDocument()
    expect(uploadFlags).toEqual([]) // 只預覽，不儲存

    fireEvent.click(screen.getByRole('checkbox', { name: '去除白色背景' }))
    await waitFor(() => expect(previewFlags).toEqual(['false', 'true']))
    await screen.findByAltText('處理後的圖示')

    fireEvent.click(screen.getByRole('button', { name: '使用這張' }))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce())
    expect(onUploaded.mock.calls[0]?.[0]).toMatchObject({ icon_key: 'custom:i-9' })
    expect(uploadFlags).toEqual(['true'])
    await waitFor(() => expect(screen.queryByText('預覽圖示')).toBeNull())
  })

  it('預覽失敗顯示後端訊息原文，且不能按使用這張', async () => {
    server.use(
      http.post(`${BASE_URL}/icons/preview`, () =>
        HttpResponse.json(
          { success: false, data: null, detail: '只接受 PNG、JPEG、WebP、GIF', response_code: 422 },
          { status: 422 },
        ),
      ),
    )
    renderFlow()
    chooseFile()
    expect(await screen.findByRole('alert')).toHaveTextContent('只接受 PNG、JPEG、WebP、GIF')
    expect(screen.getByRole('button', { name: '使用這張' })).toBeDisabled()
  })

  it('上傳失敗（例如配額已滿）顯示訊息且不關閉對話框', async () => {
    server.use(
      http.post(`${BASE_URL}/icons`, () =>
        HttpResponse.json(
          { success: false, data: null, detail: '已達 50 張上限，請先刪除不用的圖示', response_code: 409 },
          { status: 409 },
        ),
      ),
    )
    const onUploaded = renderFlow()
    chooseFile()
    await screen.findByAltText('處理後的圖示')
    fireEvent.click(screen.getByRole('button', { name: '使用這張' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('已達 50 張上限')
    expect(onUploaded).not.toHaveBeenCalled()
    expect(screen.getByText('預覽圖示')).toBeInTheDocument()
  })

  it('停用時顯示原因且不開啟檔案選擇', () => {
    render(
      <Provider store={makeStore()}>
        <IconUploadFlow variant="dropzone" disabled disabledReason="已達 50 張上限" />
      </Provider>,
    )
    expect(screen.getByText('已達 50 張上限')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /選擇圖片/ })).toHaveAttribute('aria-disabled', 'true')
  })
})
