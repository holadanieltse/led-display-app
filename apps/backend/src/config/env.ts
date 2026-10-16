// apps/backend/src/config/env.ts
import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  // MCS device control (LED ticker TCP protocol)
  MCS_DEVICE_PORT: z.coerce.number().default(5000),
  MCS_TCP_TIMEOUT_MS: z.coerce.number().default(10000),
  MCS_HANDSHAKE_TIMEOUT_MS: z.coerce.number().default(15000),
  MCS_DEVICE_ADDRESS: z.string().default('01'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n')
  console.error(`❌ Invalid environment variables:\n${issues}`)
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
