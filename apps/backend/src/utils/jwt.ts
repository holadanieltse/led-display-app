// apps/backend/src/utils/jwt.ts
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import type { UserRole } from '@prisma/client'

export type JwtPayload = {
  userId: string
  role: UserRole
  orgId: string
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload
}
