// 播放列表路由：Playlist CRUD + PlaylistItem CRUD + 权限控制（按 Display → orgId 隔离）
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { UserRole, PlaylistItemType, ScheduleType } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { requireAuth, requireRole } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { assertOrgResource } from '../utils/permissions'

const router = Router()

// ================== Zod Schemas ==================

const createPlaylistSchema = z.object({
  name: z.string().max(120).default('Default Playlist'),
})

const updatePlaylistSchema = z.object({
  name: z.string().max(120).optional(),
  isPublished: z.boolean().optional(),
})

const createItemSchema = z.object({
  itemType: z.nativeEnum(PlaylistItemType),
  name: z.string().max(120).default(''),
  icon: z.string().max(40).optional(),
  content: z.string().optional(),
  mediaUrl: z.string().optional(),
  config: z.record(z.any()).optional(), // 类型特定配置（任意 JSONB 结构）
  displayOrder: z.number().int().default(0),
  scheduleType: z.nativeEnum(ScheduleType).default(ScheduleType.ALWAYS),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  weekdays: z.string().optional(),
})

const updateItemSchema = createItemSchema.partial().omit({ displayOrder: true })
  .extend({ displayOrder: z.number().int().optional() })

const reorderItemsSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1), order: z.number().int() })).min(1),
})

// ================== Helpers ==================

// 通过 PlaylistId 找到所属 Display.orgId，用于权限断言
async function assertPlaylistAccess(req: Request, playlistId: string): Promise<{ displayOrgId: string }> {
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { display: { select: { orgId: true } } },
  })
  if (!playlist) throw new AppError('Playlist not found', 404)
  assertOrgResource(req, playlist.display.orgId)
  return { displayOrgId: playlist.display.orgId }
}

async function assertDisplayAccessByPlaylistItem(req: Request, itemId: string): Promise<void> {
  const item = await prisma.playlistItem.findUnique({
    where: { id: itemId },
    select: { playlist: { select: { display: { select: { orgId: true } } } } },
  })
  if (!item) throw new AppError('PlaylistItem not found', 404)
  assertOrgResource(req, item.playlist.display.orgId)
}

// 操作 Playlist 时自动刷新 lastUpdatedAt / lastUpdatedBy
function touchPlaylist(playlistId: string, userId: string) {
  return prisma.playlist.update({
    where: { id: playlistId },
    data: { lastUpdatedAt: new Date(), lastUpdatedBy: userId },
    select: { id: true },
  })
}

// ================== Playlists (nested under Display) ==================

/**
 * GET /api/displays/:displayId/playlists
 * 获取某 Display 的所有 Playlist（含 items 计数）
 */
router.get('/displays/:displayId/playlists', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const display = await prisma.display.findUnique({ where: { id: req.params.displayId }, select: { orgId: true } })
    if (!display) throw new AppError('Display not found', 404)
    assertOrgResource(req, display.orgId)

    const playlists = await prisma.playlist.findMany({
      where: { displayId: req.params.displayId },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'asc' },
    })
    res.json({ success: true, data: playlists })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/playlists/:id
 * 获取单个 Playlist 详情 + items 列表（按 displayOrder 排序）
 */
router.get('/playlists/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertPlaylistAccess(req, req.params.id)

    const playlist = await prisma.playlist.findUnique({
      where: { id: req.params.id },
      include: {
        items: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    })
    res.json({ success: true, data: playlist })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/displays/:displayId/playlists
 * 为 Display 创建 Playlist（一般一个 Display 只有一个 Default Playlist；UI 里是隐式自动创建的）
 */
router.post('/displays/:displayId/playlists', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER, UserRole.ORG_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const display = await prisma.display.findUnique({ where: { id: req.params.displayId }, select: { orgId: true } })
    if (!display) throw new AppError('Display not found', 404)
    assertOrgResource(req, display.orgId)

    const data = createPlaylistSchema.parse(req.body)
    const playlist = await prisma.playlist.create({
      data: {
        name: data.name,
        displayId: req.params.displayId,
        lastUpdatedBy: req.user!.id,
      },
    })
    res.status(201).json({ success: true, data: playlist })
  } catch (err) {
    next(err)
  }
})

/**
 * PUT /api/playlists/:id
 * 更新 Playlist（name / isPublished）
 */
router.put('/playlists/:id', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER, UserRole.ORG_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertPlaylistAccess(req, req.params.id)
    const data = updatePlaylistSchema.parse(req.body)

    const playlist = await prisma.playlist.update({
      where: { id: req.params.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.isPublished !== undefined ? { isPublished: data.isPublished, ...(data.isPublished ? { publishedAt: new Date() } : {}) } : {}),
        lastUpdatedAt: new Date(),
        lastUpdatedBy: req.user!.id,
      },
    })
    res.json({ success: true, data: playlist })
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /api/playlists/:id
 * 删除 Playlist（级联删除 items，Playlist.onDelete: Cascade）
 */
router.delete('/playlists/:id', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertPlaylistAccess(req, req.params.id)

    await prisma.playlist.delete({ where: { id: req.params.id } })
    res.json({ success: true, data: { id: req.params.id } })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/playlists/:id/publish
 * 发布 Playlist（isPublished=true，publishedAt=now）
 */
router.post('/playlists/:id/publish', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER, UserRole.ORG_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertPlaylistAccess(req, req.params.id)

    const playlist = await prisma.playlist.update({
      where: { id: req.params.id },
      data: {
        isPublished: true,
        publishedAt: new Date(),
        lastUpdatedAt: new Date(),
        lastUpdatedBy: req.user!.id,
      },
    })
    res.json({ success: true, data: playlist })
  } catch (err) {
    next(err)
  }
})

// ================== Playlist Items (nested under Playlist) ==================

/**
 * GET /api/playlists/:playlistId/items
 * 列出 Playlist 下所有 item（按 displayOrder 排序）
 */
router.get('/playlists/:playlistId/items', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertPlaylistAccess(req, req.params.playlistId)

    const items = await prisma.playlistItem.findMany({
      where: { playlistId: req.params.playlistId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    })
    res.json({ success: true, data: items })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/playlists/:playlistId/items
 * 创建 PlaylistItem
 */
router.post('/playlists/:playlistId/items', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER, UserRole.ORG_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertPlaylistAccess(req, req.params.playlistId)
    const data = createItemSchema.parse(req.body)

    const item = await prisma.playlistItem.create({
      data: {
        playlistId: req.params.playlistId,
        itemType: data.itemType,
        name: data.name,
        icon: data.icon ?? null,
        content: data.content ?? null,
        mediaUrl: data.mediaUrl ?? null,
        config: data.config ?? null,
        displayOrder: data.displayOrder,
        scheduleType: data.scheduleType,
        startTime: data.startTime ?? null,
        endTime: data.endTime ?? null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        weekdays: data.weekdays ?? null,
      },
    })
    await touchPlaylist(req.params.playlistId, req.user!.id)
    res.status(201).json({ success: true, data: item })
  } catch (err) {
    next(err)
  }
})

/**
 * PUT /api/playlists/:playlistId/items/:itemId
 * 更新 PlaylistItem
 */
router.put('/playlists/:playlistId/items/:itemId', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER, UserRole.ORG_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertPlaylistAccess(req, req.params.playlistId)
    await assertDisplayAccessByPlaylistItem(req, req.params.itemId)
    const data = updateItemSchema.parse(req.body)

    const item = await prisma.playlistItem.update({
      where: { id: req.params.itemId },
      data: {
        ...(data.itemType !== undefined ? { itemType: data.itemType } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.icon !== undefined ? { icon: data.icon ?? null } : {}),
        ...(data.content !== undefined ? { content: data.content ?? null } : {}),
        ...(data.mediaUrl !== undefined ? { mediaUrl: data.mediaUrl ?? null } : {}),
        ...(data.config !== undefined ? { config: data.config ?? null } : {}),
        ...(data.displayOrder !== undefined ? { displayOrder: data.displayOrder } : {}),
        ...(data.scheduleType !== undefined ? { scheduleType: data.scheduleType } : {}),
        ...(data.startTime !== undefined ? { startTime: data.startTime ?? null } : {}),
        ...(data.endTime !== undefined ? { endTime: data.endTime ?? null } : {}),
        ...(data.startDate !== undefined ? { startDate: data.startDate ? new Date(data.startDate) : null } : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
        ...(data.weekdays !== undefined ? { weekdays: data.weekdays ?? null } : {}),
      },
    })
    await touchPlaylist(req.params.playlistId, req.user!.id)
    res.json({ success: true, data: item })
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /api/playlists/:playlistId/items/:itemId
 * 删除 PlaylistItem
 */
router.delete('/playlists/:playlistId/items/:itemId', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER, UserRole.ORG_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertPlaylistAccess(req, req.params.playlistId)
    await assertDisplayAccessByPlaylistItem(req, req.params.itemId)

    await prisma.playlistItem.delete({ where: { id: req.params.itemId } })
    await touchPlaylist(req.params.playlistId, req.user!.id)
    res.json({ success: true, data: { id: req.params.itemId } })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/playlists/:playlistId/items/:itemId/duplicate
 * 复制 PlaylistItem（displayOrder = 原 item + 1，之后可能需要 reorder）
 */
router.post('/playlists/:playlistId/items/:itemId/duplicate', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER, UserRole.ORG_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertPlaylistAccess(req, req.params.playlistId)
    await assertDisplayAccessByPlaylistItem(req, req.params.itemId)

    const existing = await prisma.playlistItem.findUnique({ where: { id: req.params.itemId } })
    if (!existing) throw new AppError('PlaylistItem not found', 404)

    const copy = await prisma.playlistItem.create({
      data: {
        playlistId: req.params.playlistId,
        itemType: existing.itemType,
        name: `${existing.name || 'Copy'} (Copy)`,
        icon: existing.icon,
        content: existing.content,
        mediaUrl: existing.mediaUrl,
        config: existing.config,
        displayOrder: existing.displayOrder + 1,
        scheduleType: existing.scheduleType,
        startTime: existing.startTime,
        endTime: existing.endTime,
        startDate: existing.startDate,
        endDate: existing.endDate,
        weekdays: existing.weekdays,
      },
    })
    await touchPlaylist(req.params.playlistId, req.user!.id)
    res.status(201).json({ success: true, data: copy })
  } catch (err) {
    next(err)
  }
})

/**
 * PUT /api/playlists/:playlistId/items/reorder
 * 批量重新排序
 * Body: { items: [{ id, order }, ...] }
 */
router.put('/playlists/:playlistId/items/reorder', requireAuth, requireRole(UserRole.SUPER_ADMIN, UserRole.ORG_OWNER, UserRole.ORG_ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertPlaylistAccess(req, req.params.playlistId)
    const body = reorderItemsSchema.parse(req.body)

    await prisma.$transaction(
      body.items.map(({ id, order }) =>
        prisma.playlistItem.update({ where: { id }, data: { displayOrder: order } }),
      ),
    )
    await touchPlaylist(req.params.playlistId, req.user!.id)
    res.json({ success: true, data: { reordered: body.items.length } })
  } catch (err) {
    next(err)
  }
})

export default router
