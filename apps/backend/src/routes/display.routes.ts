// 显示屏路由：CRUD + 数据隔离（按 orgId）
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { UserRole, DisplayType, DisplayStatus } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { orgScope, assertOrgResource } from '../utils/permissions'

const router = Router()

const createDisplaySchema = z.object({
  name: z.string().min(1).max(120),
  macAddress: z.string().regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/, 'Invalid MAC address format'),
  signId: z.string().optional(),
  firmwareVersion: z.string().optional(),
  tickerHeight: z.number().int().min(1).max(256).optional(),
  type: z.nativeEnum(DisplayType).default(DisplayType.TICKER),
  status: z.nativeEnum(DisplayStatus).default(DisplayStatus.OFFLINE),
  timezone: z.string().default('UTC'),
  timezoneRegion: z.string().optional(),
  scrollSpeed: z.number().int().min(0).max(100).default(50),
  brightness: z.number().int().min(0).max(100).default(50),
  powerSaveEnabled: z.boolean().default(true),
  tickerOnTime: z.string().default('07:30'),
  tickerOffTime: z.string().default('22:00'),
  orgId: z.string().min(1, 'orgId is required'), // 仅 SUPER_ADMIN 创建时指定；ORG_* 自动用自己 orgId
})

const updateDisplaySchema = createDisplaySchema.partial().omit({ orgId: true })

// 列表：按 orgId 隔离，支持 ?orgId= 过滤（SUPER_ADMIN 才能指定其他 orgId）
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scope = orgScope(req)
    const queryOrgId = typeof req.query.orgId === 'string' ? req.query.orgId : undefined

    let where: { orgId?: string } = {}
    if (scope) {
      // 非 SUPER_ADMIN：强制限定为本组织
      where.orgId = scope
    } else if (queryOrgId) {
      // SUPER_ADMIN 可按 orgId 过滤
      where.orgId = queryOrgId
    }

    const displays = await prisma.display.findMany({
      where,
      include: {
        subscriptions: { select: { planCode: true, startDate: true, endDate: true, isPerpetual: true } },
        _count: { select: { playlists: true } },
      },
      orderBy: { name: 'asc' },
    })

    res.json({
      success: true,
      data: displays.map((d) => ({
        ...d,
        plans: d.subscriptions.map((s) => s.planCode),
      })),
    })
  } catch (err) {
    next(err)
  }
})

// 详情
router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const display = await prisma.display.findUnique({
      where: { id: req.params.id },
      include: {
        subscriptions: true,
        playlists: { include: { _count: { select: { items: true } } } },
      },
    })
    if (!display) throw new AppError('Display not found', 404)
    assertOrgResource(req, display.orgId)

    res.json({ success: true, data: display })
  } catch (err) {
    next(err)
  }
})

// 创建
router.post('/', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER, UserRole.ORG_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createDisplaySchema.parse(req.body)

    // 权限：决定目标 orgId
    let targetOrgId: string
    if (req.user!.role === UserRole.SUPER_ADMIN) {
      targetOrgId = data.orgId
    } else {
      // 非 SUPER_ADMIN：只能在本组织创建
      if (data.orgId !== req.user!.orgId) {
        // 显式传了跨组织 orgId：403 拒绝，避免静默覆盖带来的误解
        throw new AppError('Forbidden: cannot create display outside your organization', 403)
      }
      targetOrgId = req.user!.orgId
    }

    // 校验目标组织存在
    const orgExists = await prisma.organization.findUnique({ where: { id: targetOrgId }, select: { id: true } })
    if (!orgExists) throw new AppError('Target organization not found', 404)

    const display = await prisma.display.create({
      data: {
        name: data.name,
        macAddress: data.macAddress,
        signId: data.signId || null,
        firmwareVersion: data.firmwareVersion || null,
        tickerHeight: data.tickerHeight ?? null,
        type: data.type,
        status: data.status,
        timezone: data.timezone,
        timezoneRegion: data.timezoneRegion || null,
        scrollSpeed: data.scrollSpeed,
        brightness: data.brightness,
        powerSaveEnabled: data.powerSaveEnabled,
        tickerOnTime: data.tickerOnTime,
        tickerOffTime: data.tickerOffTime,
        orgId: targetOrgId,
      },
    })
    res.status(201).json({ success: true, data: display })
  } catch (err) {
    next(err)
  }
})

// 更新
router.put('/:id', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER, UserRole.ORG_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateDisplaySchema.parse(req.body)

    const existing = await prisma.display.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError('Display not found', 404)
    assertOrgResource(req, existing.orgId)

    const display = await prisma.display.update({
      where: { id: req.params.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.macAddress !== undefined ? { macAddress: data.macAddress } : {}),
        ...(data.signId !== undefined ? { signId: data.signId || null } : {}),
        ...(data.firmwareVersion !== undefined ? { firmwareVersion: data.firmwareVersion || null } : {}),
        ...(data.tickerHeight !== undefined ? { tickerHeight: data.tickerHeight } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
        ...(data.timezoneRegion !== undefined ? { timezoneRegion: data.timezoneRegion || null } : {}),
        ...(data.scrollSpeed !== undefined ? { scrollSpeed: data.scrollSpeed } : {}),
        ...(data.brightness !== undefined ? { brightness: data.brightness } : {}),
        ...(data.powerSaveEnabled !== undefined ? { powerSaveEnabled: data.powerSaveEnabled } : {}),
        ...(data.tickerOnTime !== undefined ? { tickerOnTime: data.tickerOnTime } : {}),
        ...(data.tickerOffTime !== undefined ? { tickerOffTime: data.tickerOffTime } : {}),
      },
    })
    res.json({ success: true, data: display })
  } catch (err) {
    next(err)
  }
})

// 删除
router.delete('/:id', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.display.findUnique({ where: { id: req.params.id } })
    if (!existing) throw new AppError('Display not found', 404)
    assertOrgResource(req, existing.orgId)

    await prisma.display.delete({ where: { id: req.params.id } })
    res.json({ success: true, data: { id: req.params.id } })
  } catch (err) {
    next(err)
  }
})

export default router
