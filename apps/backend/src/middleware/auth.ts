// apps/backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express'
import { UserRole } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { verifyToken } from '../utils/jwt'
import { AppError } from './errorHandler'

/**
 * 验证 Bearer Token，加载用户信息挂到 req.user。
 * 用法：router.get('/protected', requireAuth, handler)
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('Missing or invalid Authorization header', 401)
    }

    const token = header.slice(7)
    const payload = verifyToken(token)

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: true, orgId: true },
    })

    if (!user) {
      throw new AppError('User not found or token expired', 401)
    }

    req.user = user
    next()
  } catch (err) {
    if (err instanceof AppError) return next(err)
    // jwt.verify 失败会抛 JsonWebTokenError / TokenExpiredError
    next(new AppError('Invalid or expired token', 401))
  }
}

/**
 * 角色守卫工厂：限制路由仅允许指定角色访问。
 * 必须配合 requireAuth 使用（先 requireAuth 再 requireRole）。
 *
 * 用法：router.post('/', requireAuth, requireRole(UserRole.SUPER_ADMIN), handler)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401))
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Forbidden: insufficient permissions', 403))
    }
    next()
  }
}
