// 前端认证相关类型（与后端响应保持一致）
export type UserRole = 'SUPER_ADMIN' | 'ORG_OWNER' | 'ORG_ADMIN' | 'USER'

export type AuthUser = {
  id: string
  email: string
  name: string | null
  role: UserRole
  orgId: string
}

export type LoginResponse = {
  success: true
  data: { token: string; user: AuthUser }
}
