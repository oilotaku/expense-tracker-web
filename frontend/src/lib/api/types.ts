// 後端 ApiResponse[T] 外殼（harness rules/20-backend/01-routing.md BE-013）
export interface ApiResponse<T> {
  success: boolean
  data: T | null
  detail: string | null
  response_code: number
}

export function unwrapData<T>(res: ApiResponse<T>): T {
  if (res.data === null) throw new Error(res.detail ?? 'API 回應缺少 data')
  return res.data
}
