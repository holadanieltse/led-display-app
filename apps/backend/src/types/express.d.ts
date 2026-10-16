// 扩展 Express Request，附加已认证用户信息
import { UserRole } from '@prisma/client'

export type AuthUser = {
  id: string
  email: string
  name: string | null
  role: UserRole
  orgId: string
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}
