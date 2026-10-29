// 上傳前在用戶端縮圖（ADR-0006 §4）：長邊縮到 1024 並轉 PNG。瀏覽器自己會解 HEIC 與 EXIF 方向，
// iPhone 照片在這一步就變成一般 PNG，上傳通常 < 1 MB。後端仍會重新驗證與編碼，這裡只為了省流量。
export const CLIENT_MAX_EDGE = 1024

export async function resizeForUpload(file: Blob): Promise<Blob> {
  // 舊瀏覽器或 jsdom 沒有 createImageBitmap / OffscreenCanvas：原檔照送，交給後端判斷
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // 瀏覽器解不開的格式（例如非 Safari 的 HEIC）：原檔照送，後端會回明確的錯誤訊息
    return file
  }
  try {
    const scale = Math.min(1, CLIENT_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return blob ?? file
  } finally {
    bitmap.close()
  }
}
