// 数据隔离与角色权限工具
import type { Request } from 'express'
import { UserRole } from '@prisma/client'
import { AppError } from '../middleware/errorHandler'

// 角色层级（数字越大权限越高）
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  USER: 0,
  ORG_ADMIN: 1,
  ORG_OWNER: 2,
  SUPER_ADMIN: 100,
}

/**
 * 返回当前用户的数据可见 orgId 范围。
 * - SUPER_ADMIN：返回 undefined（查询时不过滤，可见全部）
 * - 其他角色：返回 req.user.orgId（只能看本组织）
 *
 * 典型用法：
 *   const where = orgScope(req) ? { orgId: orgScope(req) } : {}
 *   const list = await prisma.display.findMany({ where })
 */
export function orgScope(req: Request): string | undefined {
  if (!req.user) return undefined
  if (req.user.role === UserRole.SUPER_ADMIN) return undefined
  return req.user.orgId
}

/** 返回当前用户是否为 SUPER_ADMIN */
export function isSuperAdmin(req: Request): boolean {
  return req.user?.role === UserRole.SUPER_ADMIN
}

/** 判断用户角色是否不低于某个最低要求 */
export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole]
}

/**
 * 断言资源归属：非 SUPER_ADMIN 访问其他组织资源时抛 403。
 * SUPER_ADMIN 一律放行。
 */
export function assertOrgResource(req: Request, resourceOrgId: string): void {
  if (!req.user) throw new AppError('Not authenticated', 401)
  if (req.user.role === UserRole.SUPER_ADMIN) return
  if (req.user.orgId !== resourceOrgId) {
    throw new AppError('Forbidden: resource out of your organization scope', 403)
  }
}

/** 断言当前用户至少拥有某个角色 */
export function assertMinRole(req: Request, minRole: UserRole): void {
  if (!req.user) throw new AppError('Not authenticated', 401)
  if (!hasMinRole(req.user.role, minRole)) {
    throw new AppError(`Forbidden: requires role ${minRole} or above`, 403)
  }
}
