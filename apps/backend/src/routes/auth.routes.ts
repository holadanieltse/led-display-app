// apps/backend/src/routes/auth.routes.ts
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma'
import { hashPassword, verifyPassword } from '../utils/password'
import { signToken } from '../utils/jwt'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

// ---- POST /api/auth/login ----
const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body)

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true, role: true, orgId: true, password: true },
    })

    if (!user) {
      throw new AppError('Invalid email or password', 401)
    }

    const ok = await verifyPassword(password, user.password)
    if (!ok) {
      throw new AppError('Invalid email or password', 401)
    }

    const token = signToken({ userId: user.id, role: user.role, orgId: user.orgId })

    // 不返回 password
    const { password: _pw, ...safeUser } = user
    res.json({
      success: true,
      data: { token, user: safeUser },
    })
  } catch (err) {
    next(err)
  }
})

// ---- GET /api/auth/me ----
router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, data: { user: req.user } })
})

// ---- POST /api/auth/register (可选：注册新用户到指定组织) ----
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1).max(100),
  orgId: z.string().uuid(),
})

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name, orgId } = registerSchema.parse(req.body)

    const org = await prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw new AppError('Organization not found', 404)

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) throw new AppError('Email already registered', 409)

    const hashed = await hashPassword(password)
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), password: hashed, name, orgId, role: 'USER' },
      select: { id: true, email: true, name: true, role: true, orgId: true },
    })

    const token = signToken({ userId: user.id, role: user.role, orgId: user.orgId })
    res.status(201).json({ success: true, data: { token, user } })
  } catch (err) {
    next(err)
  }
})

export default router
