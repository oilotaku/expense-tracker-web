import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

// 兩個變數、兩種執行環境：
// - browser（client component）：NEXT_PUBLIC_API_URL → http://localhost:8000/api/v1（宿主機對外 port）
// - server-side（RSC / route handler，在 compose 容器內）：API_INTERNAL_URL → http://backend:8000/api/v1（compose 內網）
const FALLBACK = 'http://localhost:8000/api/v1'

export function resolveApiBaseUrl(): string {
  const isServer = typeof window === 'undefined'
  if (isServer && process.env.API_INTERNAL_URL) return process.env.API_INTERNAL_URL
  return process.env.NEXT_PUBLIC_API_URL ?? FALLBACK
}

// 全專案唯一的 createApi（FE-022）；各 feature 用 baseApi.injectEndpoints 放 lib/api/<feature>.ts
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: resolveApiBaseUrl(),
    credentials: 'include',
  }),
  tagTypes: [],
  endpoints: () => ({}),
})
