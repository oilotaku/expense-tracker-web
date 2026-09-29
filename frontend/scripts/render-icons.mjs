// 由 public/icons/icon.svg 產生 PWA 需要的 PNG（改了 SVG 再跑一次，結果進版控）：
//   docker run --rm -v "$PWD:/app" -w /app node:24-alpine node scripts/render-icons.mjs
import sharp from 'sharp'

const src = 'public/icons/icon.svg'
const outputs = [
  // purpose: any —— 圓角由系統處理不了（Android 會原樣顯示），自己裁成圓角
  { file: 'public/icons/icon-192.png', size: 192, rounded: true },
  { file: 'public/icons/icon-512.png', size: 512, rounded: true },
  // maskable 與 iOS apple-touch-icon：要滿版方形，系統自己裁形狀
  { file: 'public/icons/icon-maskable-512.png', size: 512, rounded: false },
  { file: 'src/app/apple-icon.png', size: 180, rounded: false },
]

for (const { file, size, rounded } of outputs) {
  let image = sharp(src, { density: 300 }).resize(size, size)
  if (rounded) {
    const r = Math.round(size * 0.22)
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`,
    )
    image = image.composite([{ input: mask, blend: 'dest-in' }])
  }
  await image.png().toFile(file)
  console.log(`${file} ${size}x${size}`)
}
