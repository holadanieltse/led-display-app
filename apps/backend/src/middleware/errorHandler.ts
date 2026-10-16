// apps/backend/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { env } from '../config/env'

export class AppError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean

  constructor(message: string, statusCode: number = 500) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = true
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

type ErrorResponse = {
  success: false
  error: {
    message: string
    details?: unknown
    stack?: string
  }
}

export function errorHandler(
  err: Error | AppError | z.ZodError | Prisma.PrismaClientKnownRequestError,
  _req: Request,
  res: Response<ErrorResponse>,
  _next: NextFunction,
) {
  let statusCode = 500
  let message = 'Internal Server Error'
  let details: unknown = undefined

  if (err instanceof AppError) {
    statusCode = err.statusCode
    message = err.message
  } else if (err instanceof z.ZodError) {
    statusCode = 400
    message = 'Validation Error'
    details = err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }))
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        statusCode = 409
        message = `Unique constraint failed on: ${(err.meta?.target as string[] | undefined)?.join(', ') ?? 'unknown field'}`
        break
      case 'P2025':
        statusCode = 404
        message = 'Record not found'
        break
      case 'P2003':
        statusCode = 409
        message = 'Foreign key constraint failed'
        break
      default:
        message = `Database error (${err.code})`
        if (env.NODE_ENV !== 'production') details = err.meta
    }
  } else if (err instanceof SyntaxError && (err as unknown as { type?: string }).type === 'entity.parse.failed') {
    statusCode = 400
    message = 'Invalid JSON payload'
  }

  if (env.NODE_ENV !== 'production' && !(err instanceof AppError) && !(err instanceof z.ZodError)) {
    console.error('🔥 [Unhandled Error]', err)
  }

  const body: ErrorResponse = {
    success: false,
    error: {
      message,
      details,
      ...(env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
    },
  }

  res.status(statusCode).json(body)
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404))
}
