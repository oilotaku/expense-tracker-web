import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { SerializedError } from '@reduxjs/toolkit'
import { baseApi } from './baseApi'
import { unwrapData, type ApiResponse } from './types'

// FE-066：型別本應由 openapi-typescript 對 backend /api/openapi.json codegen 產生
// （src/lib/api/schema.d.ts），但本 repo 尚未接上該 pipeline（package.json 未裝
// openapi-typescript、無 codegen script）。task-005 scope 不含 package.json，故先手寫
// 對齊 backend/app/schemas/auth.py 的最小型別；codegen 接上後這裡改成
// `components['schemas']['UserResponse']` 等型別。
export interface RegisterRequest {
  email: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface AuthUser {
  user_uid: string
  email: string
  has_pin: boolean
  is_admin: boolean
  must_change_password: boolean
}

// PIN 登入（design-spec.md §12.2，task-002 後端已實作）：型別對齊
// backend/app/schemas/auth.py 的 SetPinRequest / ChangePinRequest / DisablePinRequest /
// PinLoginRequest，手寫理由同上方 FE-066 備註。
export interface SetPinRequest {
  pin: string
  password: string
}

export interface ChangePinRequest {
  current_pin: string
  new_pin: string
}

export interface DisablePinRequest {
  password: string
}

export interface PinLoginRequest {
  user_uid: string
  pin: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

// baseApi 是全專案唯一的 createApi（FE-022）；enhanceEndpoints({ addTagTypes }) 讓本檔
// 在不修改 lib/api/baseApi.ts 的前提下，替共用的 api 實例登記新的 tag type。
const authApi = baseApi.enhanceEndpoints({ addTagTypes: ['User'] }).injectEndpoints({
  endpoints: (build) => ({
    register: build.mutation<AuthUser, RegisterRequest>({
      query: (body) => ({ url: 'auth/register', method: 'POST', body }),
      transformResponse: (res: ApiResponse<AuthUser>) => unwrapData(res),
    }),
    login: build.mutation<AuthUser, LoginRequest>({
      query: (body) => ({ url: 'auth/login', method: 'POST', body }),
      transformResponse: (res: ApiResponse<AuthUser>) => unwrapData(res),
      invalidatesTags: [{ type: 'User', id: 'ME' }],
    }),
    // AuthGuard 依 FE-036/FE-037 呼叫它判斷登入態（httpOnly cookie 前端無法自行讀取）；
    // 401 視為未登入。
    getMe: build.query<AuthUser, void>({
      query: () => 'auth/me',
      transformResponse: (res: ApiResponse<AuthUser>) => unwrapData(res),
      providesTags: [{ type: 'User', id: 'ME' }],
    }),
    // 首次設定 PIN（POST /auth/pin，201）。成功回應為 ApiResponse[None]（data 恆為
    // null），與「data 為 null 視為錯誤」的 unwrapData 語意衝突，故不經 unwrapData，成功時
    // 直接回傳 void；已設定過 PIN 回 409、密碼錯誤回 401（由 fetchBaseQuery 走 error 分支）。
    setPin: build.mutation<void, SetPinRequest>({
      query: (body) => ({ url: 'auth/pin', method: 'POST', body }),
      transformResponse: () => undefined,
    }),
    // 變更 PIN（PATCH /auth/pin）。current_pin 錯誤回 401（含鎖定機制達門檻後的 429，→ A15）。
    changePin: build.mutation<void, ChangePinRequest>({
      query: (body) => ({ url: 'auth/pin', method: 'PATCH', body }),
      transformResponse: () => undefined,
    }),
    // 停用 PIN 快速登入（DELETE /auth/pin，帶 body 重驗證密碼）。密碼錯誤回 401。
    deletePin: build.mutation<void, DisablePinRequest>({
      query: (body) => ({ url: 'auth/pin', method: 'DELETE', body }),
      transformResponse: () => undefined,
    }),
    // PIN 快速登入（POST /auth/login/pin，不需登入）。成功回應同 login 帶 UserResponse；
    // PIN 錯誤回 401、鎖定期間（連續失敗 5 次，→ A15）回 429。
    loginWithPin: build.mutation<AuthUser, PinLoginRequest>({
      query: (body) => ({ url: 'auth/login/pin', method: 'POST', body }),
      transformResponse: (res: ApiResponse<AuthUser>) => unwrapData(res),
      invalidatesTags: [{ type: 'User', id: 'ME' }],
    }),
    // 登出（POST /auth/logout）：清除 httpOnly cookie，讓 access_token 在 TTL 到期前就
    // 失效，而不是只清前端快取。成功回應為 ApiResponse[None]，同 setPin 不經 unwrapData。
    logout: build.mutation<void, void>({
      query: () => ({ url: 'auth/logout', method: 'POST' }),
      transformResponse: () => undefined,
      invalidatesTags: [{ type: 'User', id: 'ME' }],
    }),
    // 改密碼（PATCH /auth/change-password）：自助改密碼，也是後台管理員重設密碼後
    // must_change_password 強制流程的唯一出口。成功後 invalidate ME 讓 AuthGuard 重新
    // 讀到 must_change_password=false，才會放行離開強制改密碼頁。
    changePassword: build.mutation<void, ChangePasswordRequest>({
      query: (body) => ({ url: 'auth/change-password', method: 'PATCH', body }),
      transformResponse: () => undefined,
      invalidatesTags: [{ type: 'User', id: 'ME' }],
    }),
  }),
  overrideExisting: false,
})

export const {
  useRegisterMutation,
  useLoginMutation,
  useGetMeQuery,
  useSetPinMutation,
  useChangePinMutation,
  useDeletePinMutation,
  useLoginWithPinMutation,
  useLogoutMutation,
  useChangePasswordMutation,
} = authApi

// FE-029：錯誤處理必用型別收窄（'status' in error 判 FetchBaseQueryError），禁 `error as any`。
// 供 login / register 頁共用，故放在已在 task-005 scope 內的本檔（FE-044 抽出門檻）。
export function getAuthErrorMessage(
  error: FetchBaseQueryError | SerializedError | undefined,
): string {
  if (!error) return ''
  if ('status' in error) {
    const data = error.data
    if (
      data !== null &&
      typeof data === 'object' &&
      'detail' in data &&
      typeof data.detail === 'string'
    ) {
      return data.detail
    }
    return '發生錯誤，請稍後再試'
  }
  return error.message ?? '發生錯誤，請稍後再試'
}
