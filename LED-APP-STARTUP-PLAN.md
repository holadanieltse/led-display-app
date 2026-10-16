# LED 显示屏管理 Web App - 启动规划

> 技术栈：React + Vite + TailwindCSS / Node.js + Express + TypeScript / Prisma + PostgreSQL / JWT Auth

---

## ✅ 结论：先做数据库设计，完全正确

**为什么先从数据库开始？**

1. **LED管理系统是数据驱动型应用**：所有UI功能（组织、显示屏、订阅、播放列表）都直接映射到数据实体，数据库结构定了，后端API和前端页面的骨架就清晰了。
2. **Prisma Schema 是"单一数据源"（Single Source of Truth）**：写完 `schema.prisma` 后，可以自动生成：
   - TypeScript 类型（Prisma Client）→ 前后端共享类型
   - 数据库迁移（`prisma migrate dev`）
   - 可视化数据浏览（`prisma studio`）
3. **可以快速用 seed 数据填充** → 前端开发时直接有真实数据可用，不用等后端接口写完。

---

## 🏗️ 阶段 0：项目脚手架搭建（Day 1）

### 0.1 目录结构（Monorepo 结构）

```
led-display-app/
├── apps/
│   ├── backend/          # Node.js + Express + TS
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   ├── middleware/
│   │   │   ├── services/
│   │   │   └── utils/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── seed.ts
│   │   │   └── migrations/
│   │   └── package.json
│   └── frontend/         # React + Vite + Tailwind
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   ├── services/    # API calls
│       │   ├── types/       # shared types (or import from backend)
│       │   └── store/       # zustand / context
│       └── package.json
├── package.json          # root: concurrently + scripts
└── .gitignore
```

### 0.2 Root package.json scripts（一键启动）

```json
{
  "scripts": {
    "dev": "concurrently -n BACK,FRONT -c blue,green \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd apps/backend && npm run dev",
    "dev:frontend": "cd apps/frontend && npm run dev",
    "db:setup": "cd apps/backend && npm run db:setup",
    "build": "cd apps/backend && npm run build && cd ../frontend && npm run build"
  }
}
```

> **经验教训**（来自之前踩过的坑）：用 `concurrently` 统一入口，不要让用户开3个终端分别跑DB、后端、前端。

---

## 🗄️ 阶段 1：数据库设计（Day 1-2）—— **现在就开始做这个**

### 1.1 核心实体（基于你的UI截图分析）

从你给的截图中，我识别出以下数据实体：

| 实体                      | 对应UI                                      | 关键字段                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Organization**        | Organization Management 列表                | name, primaryContactName, primaryContactEmail                                                                                                                                                                       |
| **User**                | "1 User / 5 Users"                        | email, name, role (OWNER/ADMIN/USER), orgId                                                                                                                                                                         |
| **Display**             | Ticker Displays 表格                        | name, macAddress, signId, firmwareVersion, tickerHeight, type (TICKER/DIGITAL/HTML_FEED), status, timezone, scrollSpeed, brightness, powerSaveEnabled, tickerOnTime, tickerOffTime, orgId, isDemo, isPendingInstall |
| **SubscriptionPlan**    | Subscribed Plan (Finance/Sports/Consumer) | code (SPORTS/FINANCE/CONSUMER), name, price                                                                                                                                                                         |
| **DisplaySubscription** | 订阅选择checkbox                              | displayId, planCode, startDate, endDate, isPerpetual, autoRenew                                                                                                                                                     |
| **Playlist**            | PlayList区域                                | id, displayId, name, lastUpdatedAt, lastUpdatedBy, isPublished                                                                                                                                                      |
| **PlaylistItem**        | "Add Playlist Item"                       | playlistId, itemType (RSS/CUSTOM_TEXT/HTML/IMAGE), content/url, displayOrder, scheduleRule (Always/TimeRange)                                                                                                       |

### 1.2 schema.prisma（完整初稿）

```prisma
// apps/backend/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==================== 认证 & 多租户 ====================

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  password  String   // bcrypt hash
  role      UserRole @default(USER)
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum UserRole {
  SUPER_ADMIN  // 平台方
  ORG_OWNER    // 组织拥有者
  ORG_ADMIN    // 组织管理员
  USER         // 普通用户
}

model Organization {
  id                  String   @id @default(uuid())
  name                String
  primaryContactName  String?
  primaryContactEmail String?
  users               User[]
  displays            Display[]
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

// ==================== 显示屏核心 ====================

model Display {
  id                String      @id @default(uuid())
  name              String
  macAddress        String      @unique
  signId            String?
  firmwareVersion   String?     // "V2"
  tickerHeight      Int?        // 16 / 32 像素
  type              DisplayType @default(TICKER)
  status            DisplayStatus @default(OFFLINE)
  lastSeenAt        DateTime?

  // 配置
  timezone          String      @default("UTC")
  timezoneRegion    String?     // "Central"
  scrollSpeed       Int         @default(50)   // 0-100
  brightness        Int         @default(50)   // 0-100
  powerSaveEnabled  Boolean     @default(true)
  tickerOnTime      String      @default("07:30")  // HH:mm
  tickerOffTime     String      @default("22:00")  // HH:mm
  scheduledClearRepublish String? // cron expression

  // 标记
  isDemo            Boolean     @default(false)
  isPendingInstall  Boolean     @default(false)
  clearCacheNext    Boolean     @default(false)

  orgId             String
  org               Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  subscriptions     DisplaySubscription[]
  playlists         Playlist[]

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

enum DisplayType {
  TICKER        // 条屏（截图主要类型）
  DIGITAL       // 数字屏
  HTML_FEED     // HTML Feed
}

enum DisplayStatus {
  ONLINE
  OFFLINE
  ERROR
}

// ==================== 订阅 ====================

model SubscriptionPlan {
  code        String  @id   // SPORTS / FINANCE / CONSUMER
  name        String
  description String?
  priceMonthly Decimal?
  priceYearly  Decimal?
  displays     DisplaySubscription[]
}

model DisplaySubscription {
  id         String   @id @default(uuid())
  displayId  String
  planCode   String
  startDate  DateTime
  endDate    DateTime?
  isPerpetual Boolean @default(false)
  autoRenew  Boolean  @default(false)

  display    Display  @relation(fields: [displayId], references: [id], onDelete: Cascade)
  plan       SubscriptionPlan @relation(fields: [planCode], references: [code])

  @@unique([displayId, planCode])
}

// ==================== 播放列表 ====================

model Playlist {
  id            String   @id @default(uuid())
  displayId     String
  name          String   @default("Default Playlist")
  lastUpdatedAt DateTime @default(now())
  lastUpdatedBy String?  // userId
  isPublished   Boolean  @default(false)
  publishedAt   DateTime?

  display       Display  @relation(fields: [displayId], references: [id], onDelete: Cascade)
  items         PlaylistItem[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model PlaylistItem {
  id          String         @id @default(uuid())
  playlistId  String
  itemType    PlaylistItemType
  content     String?        // 自定义文本 / HTML / RSS URL
  mediaUrl    String?        // 图片/视频URL
  displayOrder Int           @default(0)
  scheduleType ScheduleType  @default(ALWAYS)
  startTime   String?        // "09:00" if scheduleType == TIME_RANGE
  endTime     String?        // "18:00"
  startDate   DateTime?
  endDate     DateTime?
  weekdays    String?        // "1,2,3,4,5" Mon-Fri

  playlist    Playlist       @relation(fields: [playlistId], references: [id], onDelete: Cascade)

  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

enum PlaylistItemType {
  RSS          // RSS源（截图有 "Rss 1"）
  CUSTOM_TEXT  // 自定义文本
  HTML         // HTML内容
  IMAGE        // 图片
  VIDEO        // 视频
}

enum ScheduleType {
  ALWAYS       // 一直显示
  TIME_RANGE   // 每天指定时间段
  DATE_RANGE   // 指定日期范围
  CUSTOM       // 自定义
}
```

### 1.3 数据库初始化脚本（package.json）

```json
// apps/backend/package.json
{
  "scripts": {
    "dev": "cross-env NODE_ENV=development ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "start": "cross-env NODE_ENV=production node dist/index.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "db:seed": "ts-node prisma/seed.ts",
    "db:setup": "npm run prisma:generate && npm run prisma:migrate && npm run db:seed"
  }
}
```

> **重要经验**：`prisma generate` 必须在 `db:seed` **之前**跑，否则会报 `Cannot find module '.prisma/client/default'`。

### 1.3.1 本地 PostgreSQL 环境准备（Windows 开发）

既然直接用 PostgreSQL，本地需要先跑一个 PG 实例。**推荐用 Docker**，一行命令搞定，不污染系统：

```bash
# 拉起一个 PostgreSQL 16 容器（只需跑一次）
docker run -d \
  --name led-postgres \
  -e POSTGRES_USER=led \
  -e POSTGRES_PASSWORD=led123 \
  -e POSTGRES_DB=led \
  -p 5432:5432 \
  -v led-pgdata:/var/lib/postgresql/data \
  postgres:16-alpine
```

然后在 `apps/backend/.env` 里配置连接串：
```bash
# apps/backend/.env
DATABASE_URL="postgresql://led:led123@localhost:5432/led?schema=public"
JWT_SECRET="your-dev-secret-change-in-production"
PORT=4000
```

> **不想装 Docker？** 也可以从 [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) 下载 Windows 安装包，安装时记住密码，连接串改成 `postgresql://postgres:你的密码@localhost:5432/led`。

### 1.4 seed.ts（填充初始数据）

```typescript
// apps/backend/prisma/seed.ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // 1. 清理旧数据
  await prisma.playlistItem.deleteMany()
  await prisma.playlist.deleteMany()
  await prisma.displaySubscription.deleteMany()
  await prisma.display.deleteMany()
  await prisma.user.deleteMany()
  await prisma.organization.deleteMany()
  await prisma.subscriptionPlan.deleteMany()

  // 2. 订阅计划
  await prisma.subscriptionPlan.createMany({
    data: [
      { code: 'SPORTS', name: 'Sports', priceMonthly: 29.99, priceYearly: 299.99 },
      { code: 'FINANCE', name: 'Finance', priceMonthly: 49.99, priceYearly: 499.99 },
      { code: 'CONSUMER', name: 'Consumer', priceMonthly: 19.99, priceYearly: 199.99 },
    ],
  })

  // 3. 组织 + 用户 + 显示屏（和截图一致的示例数据）
  const org1 = await prisma.organization.create({
    data: {
      name: 'Rise Demo - Cahoy',
      primaryContactName: 'Ryan Cahoy',
      primaryContactEmail: 'rjc@risedisplay.com',
      users: {
        create: {
          email: 'admin@demo.com',
          name: 'Rise Ticker Admin',
          password: '$2b$10$...', // bcrypt hash of "demo123"
          role: 'ORG_OWNER',
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
            type: 'TICKER',
            status: 'OFFLINE',
            lastSeenAt: new Date('2026-07-09T20:21:00Z'),
            timezone: 'US',
            timezoneRegion: 'Central',
            scrollSpeed: 50,
            brightness: 40,
            tickerOnTime: '07:30',
            tickerOffTime: '22:00',
            subscriptions: {
              create: {
                planCode: 'FINANCE',
                startDate: new Date('2022-06-16'),
                endDate: new Date('2100-01-01'),
                isPerpetual: true,
              },
            },
            playlists: {
              create: {
                name: 'Default Playlist',
                isPublished: false,
                items: {
                  create: [
                    {
                      itemType: 'RSS',
                      content: 'https://example.com/rss/feed1',
                      scheduleType: 'ALWAYS',
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
            type: 'TICKER',
            status: 'OFFLINE',
            lastSeenAt: new Date('2026-07-09T20:24:00Z'),
            timezone: 'US',
            timezoneRegion: 'Central',
            scrollSpeed: 50,
            brightness: 50,
            subscriptions: {
              create: [
                { planCode: 'FINANCE', startDate: new Date('2022-06-16'), endDate: new Date('2100-01-01'), isPerpetual: true },
                { planCode: 'SPORTS', startDate: new Date('2022-06-16'), endDate: new Date('2100-01-01'), isPerpetual: true },
              ],
            },
          },
          {
            name: '16 Pixel (Poker)',
            macAddress: '00:80:A3:EE:05:1F',
            signId: '0080A3EE051F',
            firmwareVersion: 'V2',
            tickerHeight: 16,
            type: 'TICKER',
            status: 'OFFLINE',
            lastSeenAt: new Date('2026-08-06T10:37:00Z'),
            timezone: 'US',
            timezoneRegion: 'Central',
            subscriptions: {
              create: {
                planCode: 'FINANCE',
                startDate: new Date('2023-08-31'),
                endDate: new Date('2100-01-01'),
                isPerpetual: true,
              },
            },
          },
        ],
      },
    },
  })

  // 4. 更多示例组织...
  await prisma.organization.create({
    data: { name: 'Rise Demo - Tradeshow', primaryContactName: 'Tradeshow', primaryContactEmail: 'sales@risedisplay.com' },
  })
  await prisma.organization.create({
    data: {
      name: 'InReality India',
      primaryContactName: 'Karthik',
      primaryContactEmail: 'karthik1@inreality.com',
    },
  })

  console.log('✅ Seed completed!')
  console.log('👤 Login: admin@demo.com / demo123')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => await prisma.$disconnect())
```

---

## 🔐 阶段 2：后端基础（Day 2-3）

### 2.1 认证方案建议：JWT（初期够简单）

**依赖安装：**

```bash
cd apps/backend
npm install express cors helmet jsonwebtoken bcryptjs zod
npm install -D typescript ts-node-dev @types/node @types/express @types/cors @types/jsonwebtoken @types/bcryptjs
npm install prisma --save-dev
npm install @prisma/client
```

### 2.2 后端文件结构

```
apps/backend/src/
├── index.ts                 # Express app bootstrap
├── config/
│   └── env.ts               # JWT_SECRET, PORT 等配置
├── middleware/
│   ├── auth.ts              # JWT 验证中间件
│   ├── rbac.ts              # 角色权限检查
│   └── errorHandler.ts
├── routes/
│   ├── auth.routes.ts       # /api/auth/login, /me
│   ├── organizations.routes.ts
│   ├── displays.routes.ts   # CRUD + 订阅 + 状态
│   ├── playlists.routes.ts  # Playlist + Items + Publish
│   └── subscriptions.routes.ts
├── controllers/
│   ├── auth.controller.ts
│   ├── organizations.controller.ts
│   ├── displays.controller.ts
│   └── playlists.controller.ts
├── services/
│   ├── auth.service.ts
│   └── display.service.ts   # 业务逻辑（如发布播放列表）
└── utils/
    ├── prisma.ts            # singleton PrismaClient
    └── password.ts          # bcrypt 封装
```

### 2.3 Express 最小骨架（index.ts）

```typescript
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { authRoutes } from './routes/auth.routes'
import { errorHandler } from './middleware/errorHandler'

const app = express()
const PORT = process.env.PORT || 4000

app.use(helmet())
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())

// Health check
app.get('/api/health', (_, res) => res.json({ ok: true, timestamp: new Date() }))

// Routes
app.use('/api/auth', authRoutes)
// ... other routes

// Error handler (must be last)
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`)
})
```

### 2.4 API 路由规划（与UI对应）

| 方法      | 路径                                   | 对应UI功能                                |
| ------- | ------------------------------------ | ------------------------------------- |
| POST    | `/api/auth/login`                    | 登录页                                   |
| GET     | `/api/auth/me`                       | 右上角用户信息                               |
| GET     | `/api/organizations`                 | Organization Management 列表（带用户数、显示屏数） |
| POST    | `/api/organizations`                 | "+ Add an Organization"               |
| GET     | `/api/displays?orgId=xxx`            | Display(s) associated with...         |
| POST    | `/api/displays`                      | "+ Add Ticker Display" 弹窗             |
| GET/PUT | `/api/displays/:id`                  | 显示屏详情 + "Edit Ticker Display" 弹窗      |
| PUT     | `/api/displays/:id/config`           | 滚动速度/亮度/时区/开关时间                       |
| POST    | `/api/displays/:id/subscriptions`    | 勾选 Sports/Finance/Consumer            |
| GET     | `/api/displays/:id/playlist`         | PlayList 区域                           |
| POST    | `/api/displays/:id/playlist/items`   | "Add Playlist Item"                   |
| POST    | `/api/displays/:id/playlist/publish` | "Publish" 按钮                          |

---

## 🎨 阶段 3：前端（Day 3-6）

### 3.1 前端初始化

```bash
cd apps
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss@3 postcss autoprefixer  # ⚠️ 先别用 Tailwind v4, Vite 6 + @tailwindcss/vite 插件在Windows上有ESM兼容坑
npx tailwindcss init -p
npm install react-router-dom axios zustand react-hook-form @hookform/resolvers zod lucide-react
```

> **经验教训（踩过的坑）**：
> 
> - **Tailwind v3 比 v4 稳**：`@tailwindcss/vite` 插件是 ESM-only，在 Windows 上容易碰到 `require() of ES Module not supported`，初期用 Tailwind v3 + PostCSS 最省心。
> - **Node 版本要统一**：Vite 6 需要 Node ≥ 18，前后端用同一个 Node 版本（建议 Node 20 LTS）。可以在 root 加 `.nvmrc`：`20`。

### 3.2 Tailwind 配置（v3 稳版）

```js
// apps/frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 从截图取色：Rise Display 蓝色系
        brand: {
          50: '#eaf4fb',
          100: '#d6e9f6',
          500: '#4a90b8',   // 主按钮蓝
          600: '#3a7ba0',   // Hover
          700: '#2e6585',
        },
        sidebar: '#f8f9fa',
      },
    },
  },
  plugins: [],
}
```

### 3.3 前端路由结构（和UI截图对应）

```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'  // 左侧边栏 + 顶栏

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/organizations" replace />} />
          <Route path="organizations" element={<OrganizationListPage />} />
          <Route path="organizations/:id" element={<OrganizationDetailPage />} />
          <Route path="displays/:id" element={<DisplayDetailPage />} />
          <Route path="premium-content" element={<PremiumContentPage />} />
          <Route path="reports/ticker" element={<TickerSubscriptionReport />} />
          <Route path="reports/digital" element={<DigitalSubscriptionReport />} />
          <Route path="data-center" element={<DataCenterPage />} />
          <Route path="bulk-actions" element={<BulkActionsPage />} />
          <Route path="maps/finance" element={<FinanceMapPage />} />
          <Route path="maps/sports" element={<SportsMapPage />} />
          <Route path="maps/rss" element={<RssMapPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

### 3.4 建议开发顺序（按页面优先级）

**P0（MVP 必须有）：**

1. ✅ **登录页** → `/login`
2. ✅ **Layout（侧边栏 + 顶栏）** → 组件化，和截图一致的导航
3. ✅ **Organization List** → 搜索、"+ Add an Organization"、每行展开显示 Displays
4. ✅ **Display List（组织下的显示屏表格）** → MAC ID、Status（Offline红标+时间）、订阅下拉、开关
5. ✅ **Display Detail** → 开关时间、Power Save、Playlist 列表、"Add Playlist Item"、Publish 按钮
6. ✅ **Edit Display Modal** → 编辑名称、时区、滚动速度、亮度滑块
7. ✅ **Edit Ticker Display Modal** → MAC ID、固件版本、Ticker Height、订阅checkbox、起止日期

**P1（第二周）：**
8. Premium Content Management
9. Reports（Ticker/Digital Subscription Report）
10. Bulk Actions

**P2（第三周+）：**
11. Data Center / Maps（Finance / Sports / RSS Map）

---

## 🔗 阶段 4：前后端联调 + 显示屏通信（Day 7-8）

这一步是LED管理系统**最特别**的地方——真实的LED屏和服务器之间需要通信。建议架构：

```
LED硬件(Ticker) ←MQTT/WebSocket→ Backend(Express) ←REST→ Frontend(React)
```

- **LED → Backend**：屏上电后用 `macAddress` 做设备认证，保持长连接，上报 `online/offline` 状态，接收播放列表下发
- **Backend**：维护在线设备注册表（内存 / Redis），Publish 时把 Playlist 推送到对应设备
- **初期**：如果还没有真实硬件，做一个 Mock Device Server，模拟 LED 设备在线/离线 + 接收内容

---

## 🚀 立即行动清单（Next Steps）

按优先级排序，**今天就可以开始第1步**：

| 顺序    | 任务                                                             | 预计耗时  | 验证标准                              |
| ----- | -------------------------------------------------------------- | ----- | --------------------------------- |
| **1** | 创建 root + apps/backend + apps/frontend 目录 + 本地 Docker 跑 PostgreSQL | 30min | `docker ps` 看到 led-postgres 运行中，目录结构正确 |
| **2** | 把上面的 `schema.prisma` 落盘 → `npx prisma migrate dev --name init` | 15min | PostgreSQL 表创建成功，`prisma:generate` 不报错 |
| **3** | 写 seed.ts → `npm run db:setup`                                 | 1h    | `npx prisma studio` 能看到示例组织和显示屏数据 |
| **4** | Backend Express 骨架 + `/api/health` + `/api/auth/login`         | 2h    | Postman 调登录能拿到 JWT                |
| **5** | Frontend Vite + Tailwind v3 + Layout 骨架                        | 2h    | `npm run dev` 打开看到侧边栏             |
| **6** | Organization List 页面 + API 打通                                  | 3h    | 页面能列出 Rise Demo - Cahoy 等3个组织     |

---

## 💡 选型补充说明

### JWT vs better-auth

| 方案              | 适合场景                                       | 建议                                                                    |
| --------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| **JWT (手动实现)**  | MVP、简单、控制度高                                | ✅ **先用这个**。10行代码就能跑，`jsonwebtoken` + `bcryptjs`，auth middleware 10行搞定 |
| **better-auth** | 需要第三方登录(Google/SSO)、Session管理、Passwordless | 等MVP跑通后再换，better-auth 支持 Prisma adapter，迁移不麻烦                         |

---

---

## ☁️ 附录 B：Windows 本地开发 + 云端生产部署——完全可行，注意这 8 点

你的技术栈（Node.js / Express / Prisma / React / Vite / Tailwind）**全部跨平台**，Windows 开发 + Linux 云服务器部署是行业常态。但需要提前做几件事避免"Windows好好的，上云就崩"。

### B.1 结论：完全合适，但需要做「开发-生产对齐」

| 层面 | 是否会因为 Windows 开发出问题？ | 原因 |
|------|--------------------------------|------|
| **前端 React + Vite + Tailwind** | ❌ 不会 | 编译产物是纯静态 HTML/CSS/JS，跨平台零差异 |
| **后端 Node.js + Express + TS** | ⚠️ 小概率 | 99% 代码一致，但有 3 类坑（下文细说） |
| **Prisma ORM + PostgreSQL** | ✅ 可控 | Prisma Client 跨平台，PostgreSQL 开发和生产用同一套 schema 和迁移，零切换成本 |

### B.2 必须做的 5 条"开发期对齐措施"（现在就加进项目）

#### ① 用 `cross-env` 设置环境变量，禁止 Windows 独有的 `set` 写法

**❌ 不要这样写（只在 Windows cmd 有效）：**
```json
"scripts": { "start": "set NODE_ENV=production && node dist/index.js" }
```

**✅ 必须这样写（跨平台）：**
```bash
cd apps/backend
npm install -D cross-env
```
```json
"scripts": {
  "start": "cross-env NODE_ENV=production node dist/index.js",
  "dev": "cross-env NODE_ENV=development ts-node-dev --respawn src/index.ts"
}
```

> 失败经验（ID 427738）：之前有项目直接删了 `NODE_ENV` 配置来"兼容 Windows"，结果上云生产环境跑成了开发模式，泄漏错误堆栈。

#### ② 用 `.dockerignore` + `.gitignore` 明确"本地产物不上传/不上云"

**根目录 `.gitignore`（提交代码时）：**
```gitignore
node_modules/
dist/
.env
.env.local
*.db
*.db-journal
prisma/migrations/*_tmp/
.DS_Store
```

**根目录 `.dockerignore`（打镜像上云时）：**
```gitignore
node_modules
dist
.git
.env
*.md
.vscode
```

> 失败经验（ID 220768）：把 Windows 的 `node_modules` 直接上传到 Linux 云服务器，里面的 `node_modules/.prisma/client/win32` 二进制在 Linux 上直接崩，正确做法是**上云后 `npm ci` 重新装依赖**，不要传 `node_modules`。

#### ③ `package-lock.json` 必须提交（锁文件是跨平台依赖一致的唯一保障）

```bash
# 永远用这两个命令，不要混用 yarn/pnpm，避免锁文件策略冲突
npm install    # 开发时
npm ci         # 云服务器/CI 构建时（严格按 lock 安装，速度也更快）
```

> 失败经验（ID 427738）：锁文件 + 手动 `npm i xxx` 反复操作，导致依赖树漂移，同样的代码在 Windows 能跑，上云报 `MODULE_NOT_FOUND`。对策：**出依赖问题时先统一 `rm -rf node_modules package-lock.json && npm i` 重建一次，然后严格只用 `npm install`。**

#### ④ 数据库：开发生产同构 PostgreSQL，零切换成本

本地和云端都用 PostgreSQL，`schema.prisma` 完全不需要改，只需改 `.env` 里的连接串：

```bash
# 本地开发 .env
DATABASE_URL="postgresql://led:led123@localhost:5432/led?schema=public"

# 云端生产 .env（云服务器上配置）
DATABASE_URL="postgresql://led:强密码@云数据库内网地址:5432/led?schema=public"
```

迁移文件也是同一套，上云时直接跑：
```bash
npx prisma migrate deploy   # 在云端执行已有的迁移文件，不会修改 schema
```

#### ⑤ 文件路径：永远用 `path.join()`，不要硬编码 `\` 或 `/`

**❌ 不要：**
```typescript
const dbPath = ".\\data\\app.db"  // 只在 Windows 有效
const filePath = `${__dirname}/uploads/${name}` // Linux/Mac 能用，但不是最佳实践
```

**✅ 必须：**
```typescript
import path from 'node:path'

const dbPath = path.join(process.cwd(), 'data', 'app.db')
const uploadDir = path.join(__dirname, '..', 'uploads')
```

### B.3 原生模块的平台差异（你这个项目大概率会遇到的 2 个）

你的项目会用到两类原生编译模块，Windows 和 Linux 二进制不兼容，**处理方式就是：不要拷贝 node_modules，云端重新 npm ci**。

| 模块 | 作用 | 平台差异处理 |
|------|------|-------------|
| `@prisma/client` 下的 `libquery_engine-*` | Prisma 查询引擎 | 云端 `npm ci` 时会自动拉取 Linux 的 `libquery_engine-linux-musl.so.node`，Windows 是 `.dll`，完全不用手动管 |
| `bcrypt` / `bcryptjs` | 密码哈希 | ✅ 建议直接用 `bcryptjs`（纯 JS，零原生依赖），避免 `bcrypt` 需要 `node-gyp` 在云端编译 C++ 代码 |

### B.4 推荐的 3 种上云部署方案（按复杂度排序）

#### 方案 A：最便宜的起步 — 1 台 Linux 云主机 + 脚本手动部署（推荐 MVP 阶段）

**适合：** 1-100 块屏，月活 < 1万。阿里云/腾讯云 2核4G 轻量服务器 ≈ ¥100/月。

**部署拓扑：**
```
[用户浏览器] → HTTPS → [Nginx (同一台机器)] → 静态文件前端(/dist)
                                          → 反向代理 → Express :4000 → PostgreSQL (同一台 / RDS)
```

**一次性部署脚本（Linux）：**
```bash
# 云服务器上只需要跑一次
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql nginx

# 每次发布代码：
cd /opt/led-app
git pull                                # 或者 scp 上传代码包
cd apps/backend && npm ci && npx prisma migrate deploy && npm run build
cd ../frontend && npm ci && npm run build
sudo systemctl restart led-backend      # 用 systemd 托管 Node 进程
sudo cp -r apps/frontend/dist/* /var/www/led-app/
sudo nginx -s reload
```

#### 方案 B：最省事 — Docker 容器化 + Docker Compose（推荐 MVP 之后切换）

**适合：** 需要快速扩缩容 / 换一台机器秒级启动。

只需加 3 个文件（MVP 跑通后再写也行，现在不用急）：
```
led-display-app/
├── Dockerfile.backend
├── Dockerfile.frontend
└── docker-compose.yml   # 一条命令拉起 frontend + backend + postgres
```

```yaml
# docker-compose.yml 示例骨架
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: led
      POSTGRES_PASSWORD: ${DB_PASS}
      POSTGRES_DB: led
    volumes:
      - pgdata:/var/lib/postgresql/data
  backend:
    build:
      context: ./apps/backend
    environment:
      DATABASE_URL: postgresql://led:${DB_PASS}@postgres:5432/led
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "4000:4000"
    depends_on: [postgres]
  frontend:
    build:
      context: ./apps/frontend
    ports:
      - "80:80"     # Nginx 容器直接托管静态资源
volumes:
  pgdata:
```

#### 方案 C：PaaS — Vercel(前端) + Railway/Render(后端)

- 前端 push 到 GitHub → Vercel 自动构建部署
- 后端连 Railway 的 PostgreSQL，自动部署
- 适合 MVP 验证期，后期可能比云主机贵

### B.5 上线前 1 周的"跨平台检查清单"

| # | 检查项 | 验证方法 |
|---|--------|----------|
| 1 | 代码里**没有硬编码 `\` 路径** | 全局搜 `\\`，确认只有转义字符不是路径 |
| 2 | **没有 Windows 独有的 `set XXX=` 脚本** | 打开所有 package.json scripts，全用 `cross-env` |
| 3 | `.env` 没进 Git | 确认 GitHub/代码包里没有密钥，走云端环境变量注入 |
| 4 | Prisma provider 改到 `postgresql` + `prisma migrate deploy` 在云 PostgreSQL 上跑通 | 连云数据库执行一次，确认迁移全部 success |
| 5 | 密码哈希用 `bcryptjs`（纯JS）而不是 `bcrypt`（C++原生） | `cat package.json \| grep bcrypt` 看依赖名 |
| 6 | LED 屏通信端口（MQTT 1883/8883 或 WebSocket）在云服务器安全组放行 | 阿里云/腾讯云后台「安全组」打开对应入站端口 |
| 7 | 上传文件目录挂到持久化卷 / 对象存储 | 不要存 Docker 容器内部 / 临时目录，否则重启就丢 |
| 8 | 后端日志落盘 + 前端用 `vite build` 后 gzip 体积 < 2MB | `ls -lh apps/frontend/dist/assets/*.js` 确认 |

---

📌 **总结：先做数据库（阶段1）是最佳路径。** schema 定好后，前后端可以并行开发——后端写 CRUD API，前端写页面骨架，用 seed 数据联调，效率最高。

📌 **Windows 开发完全合适**，直接用 PostgreSQL 开发生产同构，只需记住一句话：**不要拷贝 node_modules 上云、用 cross-env 写脚本、路径用 path.join、锁文件 package-lock.json 一定要提交**。满足这 4 条，上 Linux 云服务器 99% 的兼容性坑都能避开。

接下来要我直接帮你初始化项目（创建目录、Docker 起 PostgreSQL、写 schema.prisma + seed.ts + package.json + .env）吗？
