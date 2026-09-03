// 顯示層時區 = 後端 Settings.API_TZ 同值（Asia/Taipei）；API 已回帶 +08:00 的 ISO 字串，這裡只格式化不換算（harness rules/00-core/03-timezone.md）
const TZ = 'Asia/Taipei'

function toDate(input: string | Date): Date {
  return typeof input === 'string' ? new Date(input) : input
}

export function formatDate(input: string | Date): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(toDate(input))
}

export function formatDateTime(input: string | Date): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(toDate(input))
}

export function formatTime(input: string | Date): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(toDate(input))
}
