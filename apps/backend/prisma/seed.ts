// apps/backend/prisma/seed.ts
import { PrismaClient, UserRole, DisplayType, DisplayStatus, PlaylistItemType, ScheduleType } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // 1. 级联清理：从子表到父表顺序删除
  await prisma.playlistItem.deleteMany()
  await prisma.playlist.deleteMany()
  await prisma.displaySubscription.deleteMany()
  await prisma.display.deleteMany()
  await prisma.user.deleteMany()
  await prisma.organization.deleteMany()
  await prisma.subscriptionPlan.deleteMany()
  console.log('  ✅ Old data cleaned')

  // 2. 订阅计划
  await prisma.subscriptionPlan.createMany({
    data: [
      { code: 'SPORTS',   name: 'Sports',   description: '体育内容订阅',  priceMonthly: '29.99', priceYearly: '299.99' },
      { code: 'FINANCE',  name: 'Finance',  description: '财经内容订阅',  priceMonthly: '49.99', priceYearly: '499.99' },
      { code: 'CONSUMER', name: 'Consumer', description: '消费级内容订阅', priceMonthly: '19.99', priceYearly: '199.99' },
    ],
  })
  console.log('  ✅ Subscription plans created (SPORTS / FINANCE / CONSUMER)')

  // 3. 演示密码
  const DEMO_PASSWORD_HASH = bcrypt.hashSync('demo123', 10)

  // 4. Rise Demo - Cahoy 组织（带 1 用户 + 3 块显示屏 + 订阅 + 播放列表）
  const orgCahoy = await prisma.organization.create({
    data: {
      name: 'Rise Demo - Cahoy',
      primaryContactName: 'Ryan Cahoy',
      primaryContactEmail: 'rjc@risedisplay.com',
      users: {
        create: {
          email: 'admin@demo.com',
          name: 'Rise Ticker Admin',
          password: DEMO_PASSWORD_HASH,
          role: UserRole.ORG_OWNER,
        },
      },
      displays: {
        create: [
          {
            name: 'Bottom 16 (Ryan office)',
            macAddress: '00:80:A3:EE:21:61',
            signId: '0080A3EE2161',
            firmwareVersion: 'V2',
            tickerHeight: 16,
            type: DisplayType.TICKER,
            status: DisplayStatus.OFFLINE,
            lastSeenAt: new Date('2026-07-09T20:21:00Z'),
            timezone: 'US',
            timezoneRegion: 'Central',
            scrollSpeed: 50,
            brightness: 40,
            powerSaveEnabled: true,
            tickerOnTime: '07:30',
            tickerOffTime: '22:00',
            isDemo: true,
            subscriptions: {
              create: {
                planCode: 'FINANCE',
                startDate: new Date('2022-06-16T00:00:00Z'),
                endDate: new Date('2100-01-01T00:00:00Z'),
                isPerpetual: true,
                autoRenew: false,
              },
            },
            playlists: {
              create: {
                name: 'Default Playlist',
                lastUpdatedBy: 'seed',
                isPublished: false,
                items: {
                  create: [
                    {
                      itemType: PlaylistItemType.RSS,
                      content: 'https://feeds.reuters.com/reuters/businessNews',
                      scheduleType: ScheduleType.ALWAYS,
                      displayOrder: 0,
                    },
                  ],
                },
              },
            },
          },
          {
            name: 'Top 32 (Ryan office)',
            macAddress: '00:80:A3:EE:CE:09',
            signId: '0080A3EECE09',
            firmwareVersion: 'V2',
            tickerHeight: 32,
            type: DisplayType.TICKER,
            status: DisplayStatus.OFFLINE,
            lastSeenAt: new Date('2026-07-09T20:24:00Z'),
            timezone: 'US',
            timezoneRegion: 'Central',
            scrollSpeed: 50,
            brightness: 50,
            powerSaveEnabled: true,
            tickerOnTime: '07:30',
            tickerOffTime: '22:00',
            isDemo: true,
            subscriptions: {
              create: [
                { planCode: 'FINANCE', startDate: new Date('2022-06-16T00:00:00Z'), endDate: new Date('2100-01-01T00:00:00Z'), isPerpetual: true },
                { planCode: 'SPORTS',  startDate: new Date('2022-06-16T00:00:00Z'), endDate: new Date('2100-01-01T00:00:00Z'), isPerpetual: true },
              ],
            },
          },
          {
            name: '16 Pixel (Poker)',
            macAddress: '00:80:A3:EE:05:1F',
            signId: '0080A3EE051F',
            firmwareVersion: 'V2',
            tickerHeight: 16,
            type: DisplayType.TICKER,
            status: DisplayStatus.OFFLINE,
            lastSeenAt: new Date('2026-08-06T10:37:00Z'),
            timezone: 'US',
            timezoneRegion: 'Central',
            scrollSpeed: 50,
            brightness: 50,
            powerSaveEnabled: true,
            tickerOnTime: '07:30',
            tickerOffTime: '22:00',
            isDemo: true,
            subscriptions: {
              create: {
                planCode: 'FINANCE',
                startDate: new Date('2023-08-31T00:00:00Z'),
                endDate: new Date('2100-01-01T00:00:00Z'),
                isPerpetual: true,
              },
            },
          },
        ],
      },
    },
    include: { users: true, displays: true },
  })
  console.log(`  ✅ Organization "Rise Demo - Cahoy" created: ${orgCahoy.users.length} user(s), ${orgCahoy.displays.length} display(s)`)

  // 5. 其他示例组织
  const orgTradeshow = await prisma.organization.create({
    data: {
      name: 'Rise Demo - Tradeshow',
      primaryContactName: 'Tradeshow Sales',
      primaryContactEmail: 'sales@risedisplay.com',
      displays: {
        create: [
          {
            name: 'Booth A - Main Ticker',
            macAddress: '00:80:A3:AA:00:01',
            signId: '0080A3AA0001',
            firmwareVersion: 'V2',
            tickerHeight: 32,
            type: DisplayType.TICKER,
            status: DisplayStatus.OFFLINE,
            timezone: 'US',
            timezoneRegion: 'Eastern',
            subscriptions: {
              create: [{ planCode: 'CONSUMER', startDate: new Date('2024-01-01T00:00:00Z'), endDate: new Date('2100-01-01T00:00:00Z'), isPerpetual: true }],
            },
          },
          {
            name: 'Booth B - Digital Sign',
            macAddress: '00:80:A3:AA:00:02',
            signId: '0080A3AA0002',
            firmwareVersion: 'V2',
            type: DisplayType.DIGITAL,
            status: DisplayStatus.OFFLINE,
            timezone: 'US',
            timezoneRegion: 'Eastern',
          },
          {
            name: 'Lobby - HTML Feed',
            macAddress: '00:80:A3:AA:00:03',
            signId: '0080A3AA0003',
            type: DisplayType.HTML_FEED,
            status: DisplayStatus.OFFLINE,
            timezone: 'US',
            timezoneRegion: 'Eastern',
          },
          {
            name: 'Entrance Ticker',
            macAddress: '00:80:A3:AA:00:04',
            signId: '0080A3AA0004',
            firmwareVersion: 'V2',
            tickerHeight: 16,
            type: DisplayType.TICKER,
            status: DisplayStatus.OFFLINE,
            timezone: 'US',
            timezoneRegion: 'Eastern',
            subscriptions: {
              create: [{ planCode: 'SPORTS', startDate: new Date('2024-01-01T00:00:00Z'), endDate: new Date('2100-01-01T00:00:00Z'), isPerpetual: true }],
            },
          },
        ],
      },
    },
    include: { displays: true },
  })
  console.log(`  ✅ Organization "Rise Demo - Tradeshow" created: ${orgTradeshow.displays.length} display(s)`)

  const orgIndia = await prisma.organization.create({
    data: {
      name: 'InReality India',
      primaryContactName: 'Karthik',
      primaryContactEmail: 'karthik1@inreality.com',
      users: {
        createMany: {
          data: [
            { email: 'karthik@demo.com',    name: 'Karthik',     password: DEMO_PASSWORD_HASH, role: UserRole.ORG_OWNER },
            { email: 'user2@inreality.com', name: 'User Two',    password: DEMO_PASSWORD_HASH, role: UserRole.ORG_ADMIN },
            { email: 'user3@inreality.com', name: 'User Three',  password: DEMO_PASSWORD_HASH, role: UserRole.USER },
            { email: 'user4@inreality.com', name: 'User Four',   password: DEMO_PASSWORD_HASH, role: UserRole.USER },
            { email: 'user5@inreality.com', name: 'User Five',   password: DEMO_PASSWORD_HASH, role: UserRole.USER },
          ],
        },
      },
      displays: {
        createMany: {
          data: [
            { name: 'Mumbai Office - Lobby',  macAddress: '00:80:A3:BB:00:01', signId: '0080A3BB0001', firmwareVersion: 'V2', tickerHeight: 32, type: DisplayType.TICKER, status: DisplayStatus.OFFLINE, timezone: 'Asia', timezoneRegion: 'Kolkata', scrollSpeed: 50, brightness: 60 },
            { name: 'Mumbai Office - Floor 2', macAddress: '00:80:A3:BB:00:02', signId: '0080A3BB0002', firmwareVersion: 'V2', tickerHeight: 16, type: DisplayType.TICKER, status: DisplayStatus.OFFLINE, timezone: 'Asia', timezoneRegion: 'Kolkata' },
            { name: 'Bangalore Office',       macAddress: '00:80:A3:BB:00:03', signId: '0080A3BB0003', firmwareVersion: 'V2', tickerHeight: 32, type: DisplayType.TICKER, status: DisplayStatus.OFFLINE, timezone: 'Asia', timezoneRegion: 'Kolkata' },
            { name: 'Delhi Office - Ticker 1', macAddress: '00:80:A3:BB:00:04', signId: '0080A3BB0004', firmwareVersion: 'V2', tickerHeight: 16, type: DisplayType.TICKER, status: DisplayStatus.OFFLINE, timezone: 'Asia', timezoneRegion: 'Kolkata' },
            { name: 'Delhi Office - Ticker 2', macAddress: '00:80:A3:BB:00:05', signId: '0080A3BB0005', firmwareVersion: 'V2', tickerHeight: 16, type: DisplayType.TICKER, status: DisplayStatus.OFFLINE, timezone: 'Asia', timezoneRegion: 'Kolkata' },
            { name: 'Showroom - Digital 1',   macAddress: '00:80:A3:BB:00:06', signId: '0080A3BB0006', type: DisplayType.DIGITAL, status: DisplayStatus.OFFLINE, timezone: 'Asia', timezoneRegion: 'Kolkata' },
            { name: 'Showroom - Digital 2',   macAddress: '00:80:A3:BB:00:07', signId: '0080A3BB0007', type: DisplayType.DIGITAL, status: DisplayStatus.OFFLINE, timezone: 'Asia', timezoneRegion: 'Kolkata' },
            { name: 'Reception - HTML',       macAddress: '00:80:A3:BB:00:08', signId: '0080A3BB0008', type: DisplayType.HTML_FEED, status: DisplayStatus.OFFLINE, timezone: 'Asia', timezoneRegion: 'Kolkata' },
            { name: 'Warehouse Ticker',       macAddress: '00:80:A3:BB:00:09', signId: '0080A3BB0009', firmwareVersion: 'V2', tickerHeight: 16, type: DisplayType.TICKER, status: DisplayStatus.OFFLINE, timezone: 'Asia', timezoneRegion: 'Kolkata' },
          ],
        },
      },
    },
    include: { users: true, displays: true },
  })
  console.log(`  ✅ Organization "InReality India" created: ${orgIndia.users.length} user(s), ${orgIndia.displays.length} display(s)`)

  // 6. 一个 SUPER_ADMIN 平台用户（挂在 orgCahoy 下，因为必须有 org）
  await prisma.user.create({
    data: {
      email: 'superadmin@demo.com',
      name: 'Platform Super Admin',
      password: DEMO_PASSWORD_HASH,
      role: UserRole.SUPER_ADMIN,
      orgId: orgCahoy.id,
    },
  })
  console.log('  ✅ Super admin user created')

  console.log('')
  console.log('============================================')
  console.log('✅ Seed completed successfully!')
  console.log('============================================')
  console.log('')
  console.log('👤 Demo accounts (password = "demo123"):')
  console.log('   · superadmin@demo.com  (SUPER_ADMIN - 平台管理员)')
  console.log('   · admin@demo.com       (ORG_OWNER  - Rise Demo - Cahoy)')
  console.log('   · karthik@demo.com     (ORG_OWNER  - InReality India)')
  console.log('')
  console.log('🏢 Organizations:')
  console.log('   · Rise Demo - Cahoy      → 1 user,  3 displays (Ryan office screens)')
  console.log('   · Rise Demo - Tradeshow  → 0 users, 4 displays (TICKER/DIGITAL/HTML_FEED各类型齐全)')
  console.log('   · InReality India        → 5 users, 9 displays')
  console.log('')
  console.log('📊 View data: npx prisma studio')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
