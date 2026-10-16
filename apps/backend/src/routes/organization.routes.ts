// 组织路由：CRUD + 数据隔离
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { UserRole } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { orgScope, assertOrgResource } from '../utils/permissions'

const router = Router()

const createOrgSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(120),
  primaryContactName: z.string().max(120).optional(),
  primaryContactEmail: z.string().email('Invalid contact email').optional().or(z.literal('')),
})

const updateOrgSchema = createOrgSchema.partial()

// 列表：SUPER_ADMIN 看全部；ORG_* 只看自己组织
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scope = orgScope(req)
    const where = scope ? { id: scope } : {}

    const orgs = await prisma.organization.findMany({
      where,
      include: {
        _count: { select: { users: true, displays: true } },
      },
      orderBy: { name: 'asc' },
    })

    res.json({
      success: true,
      data: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        primaryContactName: o.primaryContactName,
        primaryContactEmail: o.primaryContactEmail,
        userCount: o._count.users,
        displayCount: o._count.displays,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// 详情：含显示屏和用户列表
router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        users: {
          select: { id: true, email: true, name: true, role: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        displays: {
          select: {
            id: true, name: true, macAddress: true, type: true, status: true,
            lastSeenAt: true, createdAt: true,
          },
          orderBy: { name: 'asc' },
        },
      },
    })

    if (!org) throw new AppError('Organization not found', 404)
    assertOrgResource(req, org.id)

    res.json({ success: true, data: org })
  } catch (err) {
    next(err)
  }
})

// 创建：仅 SUPER_ADMIN
router.post('/', requireAuth, requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createOrgSchema.parse(req.body)
    const org = await prisma.organization.create({
      data: {
        name: data.name,
        primaryContactName: data.primaryContactName || null,
        primaryContactEmail: data.primaryContactEmail || null,
      },
    })
    res.status(201).json({ success: true, data: org })
  } catch (err) {
    next(err)
  }
})

// 更新：SUPER_ADMIN 或本组织 ORG_OWNER
router.put('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateOrgSchema.parse(req.body)

    const existing = await prisma.organization.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError('Organization not found', 404)
    assertOrgResource(req, existing.id)

    // 仅 ORG_OWNER 或 SUPER_ADMIN 可改组织信息
    if (req.user!.role !== UserRole.SUPER_ADMIN && req.user!.role !== UserRole.ORG_OWNER) {
      throw new AppError('Forbidden: only org owner or super admin can edit organization', 403)
    }

    const org = await prisma.organization.update({
      where: { id: req.params.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.primaryContactName !== undefined ? { primaryContactName: data.primaryContactName || null } : {}),
        ...(data.primaryContactEmail !== undefined ? { primaryContactEmail: data.primaryContactEmail || null } : {}),
      },
    })
    res.json({ success: true, data: org })
  } catch (err) {
    next(err)
  }
})

// 删除：仅 SUPER_ADMIN
router.delete('/:id', requireAuth, requireRole(UserRole.SUPER_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.organization.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError('Organization not found', 404)

    await prisma.organization.delete({ where: { id: req.params.id } })
    res.json({ success: true, data: { id: req.params.id } })
  } catch (err) {
    next(err)
  }
})

export default router
