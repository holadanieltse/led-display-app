// apps/backend/src/index.ts
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env'
import { prisma } from './utils/prisma'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import authRoutes from './routes/auth.routes'
import organizationRoutes from './routes/organization.routes'
import displayRoutes from './routes/display.routes'
import userRoutes from './routes/user.routes'
import playlistRoutes from './routes/playlist.routes'
import feedRoutes from './routes/feed.routes'
import deviceRoutes from './routes/device.routes'
import { startDeviceServer, stopDeviceServer } from './services/deviceServer'

async function bootstrap() {
  const app = express()

  // ---- 基础中间件 ----
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '10mb' }))

  // ---- 健康检查 ----
  app.get('/api/health', async (_req, res) => {
    let dbOk = false
    try {
      await prisma.$queryRawUnsafe('SELECT 1')
      dbOk = true
    } catch {
      dbOk = false
    }
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      env: env.NODE_ENV,
      db: dbOk ? 'connected' : 'disconnected',
    })
  })

  // ---- API 路由 ----
  app.use('/api/auth', authRoutes)
  app.use('/api/organizations', organizationRoutes)
  app.use('/api/displays', displayRoutes)
  app.use('/api/users', userRoutes)
  app.use('/api', playlistRoutes)
  app.use('/api', feedRoutes)
  app.use('/api', deviceRoutes) // MCS device control: /api/displays/:id/device/:command

  // ---- 404 & 错误处理（必须放在最后） ----
  app.use(notFoundHandler)
  app.use(errorHandler)

  const server = app.listen(env.PORT, () => {
    const url = `http://localhost:${env.PORT}`
    console.log('')
    console.log('🚀 =============================================')
    console.log(`🚀  LED Display Backend is running!`)
    console.log(`🚀  Environment : ${env.NODE_ENV}`)
    console.log(`🚀  URL         : ${url}`)
    console.log(`🚀  Health Check: ${url}/api/health`)
    console.log('🚀 =============================================')
    console.log('')
  })

  // ---- Device Portal (xPico 240 TCP server) ----
  try {
    await startDeviceServer()
  } catch (e) {
    console.error('❌ Failed to start Device Portal server:', (e as Error).message)
  }

  // 优雅关闭
  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`)
    stopDeviceServer()
    server.close(async () => {
      await prisma.$disconnect()
      console.log('✅ Server closed, DB disconnected')
      process.exit(0)
    })
    // 10 秒后强制退出
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout')
      process.exit(1)
    }, 10000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

bootstrap().catch((e) => {
  console.error('❌ Failed to start server:', e)
  process.exit(1)
})
