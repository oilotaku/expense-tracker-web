import { baseApi } from './baseApi'
import { unwrapData, type ApiResponse } from './types'

// FE-066：手寫型別對齊 backend/app/schemas/admin.py，理由同 authApi.ts 頂部備註
// （本 repo 尚未接上 openapi-typescript codegen）。
export interface AdminUserListItem {
  user_uid: string
  email: string
  created_at: string
  account_count: number
  transaction_count: number
}

export interface AdminUserListResponse {
  items: AdminUserListItem[]
  total: number
}

export interface AdminResetPasswordResponse {
  temporary_password: string
}

const adminApi = baseApi.enhanceEndpoints({ addTagTypes: ['AdminUser'] }).injectEndpoints({
  endpoints: (build) => ({
    listAdminUsers: build.query<AdminUserListResponse, void>({
      query: () => 'admin/users',
      transformResponse: (res: ApiResponse<AdminUserListResponse>) => unwrapData(res),
      providesTags: (result) => [
        ...(result?.items ?? []).map((u) => ({ type: 'AdminUser' as const, id: u.user_uid })),
        { type: 'AdminUser' as const, id: 'LIST' },
      ],
    }),
    deleteAdminUser: build.mutation<void, string>({
      query: (userUid) => ({ url: `admin/users/${userUid}`, method: 'DELETE' }),
      transformResponse: () => undefined,
      invalidatesTags: [{ type: 'AdminUser', id: 'LIST' }],
    }),
    // 成功回應帶產生的臨時密碼（僅此一次），故不經 unwrapData 的「data 為 null 視為錯誤」
    // 語意判斷即可（data 一定有值），沿用既有 unwrapData 是最一致的寫法。
    resetAdminUserPassword: build.mutation<AdminResetPasswordResponse, string>({
      query: (userUid) => ({ url: `admin/users/${userUid}/reset-password`, method: 'POST' }),
      transformResponse: (res: ApiResponse<AdminResetPasswordResponse>) => unwrapData(res),
    }),
  }),
  overrideExisting: false,
})

export const {
  useListAdminUsersQuery,
  useDeleteAdminUserMutation,
  useResetAdminUserPasswordMutation,
} = adminApi
