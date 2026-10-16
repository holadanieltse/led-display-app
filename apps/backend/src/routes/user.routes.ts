// 用户管理路由：CRUD + 数据隔离
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { UserRole } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { orgScope, assertOrgResource } from '../utils/permissions'
import { hashPassword } from '../utils/password'

const router = Router()

const createUserSchema = z.object({
  email: z.string().email('Invalid email'),
  name: z.string().max(120).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.nativeEnum(UserRole).default(UserRole.USER),
  orgId: z.string().min(1).optional(), // 仅 SUPER_ADMIN 可指定；ORG_OWNER 自动用自己组织
})

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().max(120).optional(),
  password: z.string().min(6).optional(),
  role: z.nativeEnum(UserRole).optional(),
})

const safeUserSelect = {
  id: true, email: true, name: true, role: true, orgId: true, createdAt: true, updatedAt: true,
} as const

// 列表：SUPER_ADMIN 看全部；ORG_OWNER 看本组织（且屏蔽 SUPER_ADMIN 角色用户）
router.get('/', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scope = orgScope(req)
    const where: Record<string, unknown> = scope ? { orgId: scope } : {}
    if (req.user!.role !== UserRole.SUPER_ADMIN) {
      // 非 SUPER_ADMIN 请求者：看不到任何 SUPER_ADMIN 角色用户（信息隐藏）
      where.role = { not: UserRole.SUPER_ADMIN }
    }

    const users = await prisma.user.findMany({
      where,
      select: safeUserSelect,
      orderBy: { createdAt: 'asc' },
    })

    res.json({ success: true, data: users })
  } catch (err) {
    next(err)
  }
})

// 详情：非 SUPER_ADMIN 请求者访问 SUPER_ADMIN 用户时返回 404（信息隐藏，避免泄露用户存在）
router.get('/:id', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: safeUserSelect })
    if (!user) throw new AppError('User not found', 404)
    if (req.user!.role !== UserRole.SUPER_ADMIN && user.role === UserRole.SUPER_ADMIN) {
      throw new AppError('User not found', 404)
    }
    assertOrgResource(req, user.orgId)

    res.json({ success: true, data: user })
  } catch (err) {
    next(err)
  }
})

// 创建：SUPER_ADMIN 可创建任意角色（包括 SUPER_ADMIN）；ORG_OWNER 只能在本组织创建 ORG_ADMIN/USER
router.post('/', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createUserSchema.parse(req.body)

    let targetOrgId: string
    let targetRole: UserRole

    if (req.user!.role === UserRole.SUPER_ADMIN) {
      targetOrgId = data.orgId || req.user!.orgId
      targetRole = data.role
    } else {
      // ORG_OWNER：只能在本组织创建，不能创建 SUPER_ADMIN / ORG_OWNER
      if (data.orgId !== undefined && data.orgId !== req.user!.orgId) {
        // 显式传了跨组织 orgId：拒绝（403），避免静默覆盖导致的误解
        throw new AppError('Forbidden: cannot create user outside your organization', 403)
      }
      targetOrgId = req.user!.orgId
      if (data.role === UserRole.SUPER_ADMIN || data.role === UserRole.ORG_OWNER) {
        throw new AppError('Forbidden: cannot create user with role SUPER_ADMIN or ORG_OWNER', 403)
      }
      targetRole = data.role
    }

    // 校验组织存在
    const orgExists = await prisma.organization.findUnique({ where: { id: targetOrgId }, select: { id: true } })
    if (!orgExists) throw new AppError('Target organization not found', 404)

    // 校验邮箱唯一
    const emailExists = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() }, select: { id: true } })
    if (emailExists) throw new AppError('Email already registered', 409)

    const hashed = await hashPassword(data.password)
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name || null,
        password: hashed,
        role: targetRole,
        orgId: targetOrgId,
      },
      select: safeUserSelect,
    })
    res.status(201).json({ success: true, data: user })
  } catch (err) {
    next(err)
  }
})

// 更新
router.put('/:id', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateUserSchema.parse(req.body)

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError('User not found', 404)
    assertOrgResource(req, existing.orgId)

    // ORG_OWNER 不能改 SUPER_ADMIN，也不能把自己或别人提升为 SUPER_ADMIN
    if (req.user!.role !== UserRole.SUPER_ADMIN) {
      if (existing.role === UserRole.SUPER_ADMIN) {
        throw new AppError('Forbidden: cannot modify super admin', 403)
      }
      if (data.role === UserRole.SUPER_ADMIN) {
        throw new AppError('Forbidden: cannot promote to super admin', 403)
      }
    }

    // 邮箱唯一性校验
    if (data.email && data.email.toLowerCase() !== existing.email) {
      const emailExists = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() }, select: { id: true } })
      if (emailExists && emailExists.id !== existing.id) {
        throw new AppError('Email already registered', 409)
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(data.email !== undefined ? { email: data.email.toLowerCase() } : {}),
        ...(data.name !== undefined ? { name: data.name || null } : {}),
        ...(data.password !== undefined ? { password: await hashPassword(data.password) } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
      },
      select: safeUserSelect,
    })
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

// 删除
router.delete('/:id', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError('User not found', 404)
    assertOrgResource(req, existing.orgId)

    // 不能删除自己
    if (existing.id === req.user!.id) {
      throw new AppError('Cannot delete your own account', 400)
    }

    // ORG_OWNER 不能删除 SUPER_ADMIN
    if (req.user!.role !== UserRole.SUPER_ADMIN && existing.role === UserRole.SUPER_ADMIN) {
      throw new AppError('Forbidden: cannot delete super admin', 403)
    }

    await prisma.user.delete({ where: { id: req.params.id } })
    res.json({ success: true, data: { id: req.params.id } })
  } catch (err) {
    next(err)
  }
})

export default router
