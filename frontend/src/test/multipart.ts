// jsdom 的 Blob 交給 Node 內建 fetch（undici）序列化時檔案內容會變空、檔名變 blob，msw 的
// request.formData() 也解析不了；真實瀏覽器沒有這個問題。測試改讀 multipart 原文驗證欄位。
export async function readMultipart(request: Request): Promise<{ hasFile: boolean; fields: Record<string, string> }> {
  const text = await request.text()
  const fields: Record<string, string> = {}
  let hasFile = false
  for (const part of text.split(/\r\n--/)) {
    const name = /name="([^"]+)"/.exec(part)?.[1]
    if (!name) continue
    if (/filename="/.test(part)) {
      if (name === 'file') hasFile = true
      continue
    }
    fields[name] = part.split('\r\n\r\n')[1]?.replace(/\r\n$/, '') ?? ''
  }
  return { hasFile, fields }
}
