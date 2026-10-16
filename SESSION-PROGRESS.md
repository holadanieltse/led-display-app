# daycom LED Display Management System — Development Progress

> Last updated: 2026-08-18


## 🚀 Daily Startup Ritual (Windows)

**Every time you start working on this project, run these 3 steps IN ORDER:**

### 1. Start PostgreSQL (from project root, in PowerShell)

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D "C:\Users\Daniel\Desktop\Daniel API ticker\pgdata" -l "C:\Users\Daniel\Desktop\Daniel API ticker\pgdata\startup.log" start

⚠️ Important: Your terminal must be PowerShell for this to work. If it's cmd, drop the & at the start.

cd apps/backend
npm run dev


cd apps/frontend
npm run dev

## Project Overview

| Item | Details |
|---|---|
| Name | daycom — LED Display Management System |
| Tech Stack | React + Vite + TailwindCSS / Node.js + Express + TypeScript / Prisma + PostgreSQL / JWT |
| Theme | Green (Emerald, primary `#10b981`) |
| Brand | daycom (logo: green rounded square + white "d") |

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     Web Browser (React)                    │
│  Organization List · Display Detail · Playlist Editor     │
│  Device Control Popover · RSS Feed Config · Stock/Sports  │
└────────────────────────┬─────────────────────────────────┘
                         │ REST API (HTTP :4000)
┌────────────────────────▼─────────────────────────────────┐
│                  Backend (Express + TS)                    │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐   │
│  │ REST API │  │ Feed Svc  │  │ Device Portal (TCP)  │   │
│  │ (Express)│  │ (RSS/     │  │ Listens on :5000     │   │
│  │          │  │  Stocks/  │  │                      │   │
│  │          │  │  Sports)  │  │  xPico 240 connects  │   │
│  │          │  │           │  │  IN, sends MAC as    │   │
│  │          │  │           │  │  handshake           │   │
│  └──────────┘  └───────────┘  └──────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐     │
│  │              MCS Protocol Service                 │     │
│  │  Builds ^B{addr}^AC{cmd}{data}^C packets         │     │
│  │  Pushes through Device Portal TCP socket          │     │
│  └──────────────────────────────────────────────────┘     │
│  ┌──────────────────────────────────────────────────┐     │
│  │              Prisma ORM → PostgreSQL              │     │
│  │  Organizations · Displays · Users · Playlists     │     │
│  └──────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
                         │ TCP :5000 (persistent)
┌────────────────────────▼─────────────────────────────────┐
│              xPico 240 (Device Portal)                    │
│  Connects to backend on startup, sends MAC address        │
│  Maintains persistent TCP connection                       │
│  Transparent serial tunnel to LED ticker hardware          │
└──────────────────────────────────────────────────────────┘
                         │ Serial (RS-232)
┌────────────────────────▼─────────────────────────────────┐
│              LED Ticker Display Hardware                   │
│  Receives MCS protocol commands, displays text/scroll      │
└──────────────────────────────────────────────────────────┘
```

## Completed Features

### 1. Project Infrastructure
- Monorepo structure (apps/frontend + apps/backend)
- PostgreSQL 17 database + Prisma ORM
- Seed data: 3 organizations, 16 displays, 3 subscription plans, multiple users
- Concurrent dev runner (`npm run dev` starts both backend + frontend)

### 2. Authentication & Authorization
- Backend JWT auth (token signing/verification/middleware)
- `/api/auth/login` login endpoint
- `/api/auth/me` current user endpoint
- Frontend login page (form validation + demo account quick-fill)
- Zustand state management (token + user + hydrate session restore)
- Axios interceptors (auto-attach token + 401 redirect to login)
- Route guard ProtectedRoute (redirect if unauthenticated + hydrate anti-flicker)

### 3. Role-Based Access Control & Data Isolation
- 4 role levels: SUPER_ADMIN / ORG_OWNER / ORG_ADMIN / USER
- Permission utilities `permissions.ts`: `orgScope()` / `assertOrgResource()` / `assertMinRole()`
- `requireRole(...roles)` role guard middleware
- Data isolation: all queries filtered by `orgId`, SUPER_ADMIN sees all
- Frontend menu/button visibility by role (Data Center = SUPER_ADMIN only, Bulk Actions = ORG_OWNER+)

### 4. Business Routes (CRUD + Data Isolation)
| Route | Function | Isolation Strategy |
|---|---|---|
| `/api/organizations` | Organization CRUD | SUPER_ADMIN sees all, ORG_* sees own org only |
| `/api/displays` | Display CRUD | Filter by orgId; ORG_ADMIN+ can edit |
| `/api/users` | User management | SUPER_ADMIN/ORG_OWNER can manage |
| `/api/playlists` | Playlist + Playlist Items | Filter by orgId through display |
| `/api/feeds/*` | RSS/Stocks/Sports feeds | Authenticated, org-scoped publishing |
| `/api/displays/:id/command` | MCS device control | Org-scoped, requires device online |
| `/api/displays/:id/rss-publish` | RSS → MCS → device | Org-scoped, requires device online |
| `/api/devices/online` | List online devices | Authenticated (monitoring) |

### 5. Forms & UI Components
- Reusable Modal component (overlay + ESC close + three sizes)
- Toast notification component (success/error/info, 3s auto-dismiss)
- OrganizationForm (name + contact + email, Zod validation)
- DisplayForm (name + MAC + type + status + firmware + timezone + sliders + on/off time)
- Delete confirmation dialog (red warning + cascade explanation)
- All operations show Toast on success + list refreshes in real-time

### 6. Display Detail Page
- Per-display configuration view with editable settings
- Playlist management (add/edit/reorder/delete items)
- Playlist item types: MESSAGE, RSS_FEED, IMAGE, FINANCIAL_QUOTES, SPORTS_SCORES
- "Coming soon" types: CLOCK, HTML_FEED, WEATHER, SOCIAL_MEDIA
- Publish button to push playlist to device

### 7. Device Control (MCS Protocol over TCP/IP)
- **DeviceControlPopover** component: "i" icon that opens command menu
- Commands: Power On, Power Off, Restart, Clear Memory, Sync Date & Time
- Destructive commands (Power Off, Restart, Clear Memory) require inline confirmation
- Commands sent via MCS protocol `^B{addr}^AC{command}^C` through the Device Portal TCP connection
- Real-time status feedback (success/error with device IP)
- Footer hint explains transport mechanism

### 8. Device Portal TCP Server (xPico 240 Inbound Connections)
- **Architecture inversion**: Instead of backend doing ARP lookup to find devices, devices connect IN to the backend
- xPico 240 connects on startup, sends MAC address (e.g. `0080A3EE051F`) as handshake
- Backend maintains in-memory connection registry (`Map<normalized MAC, socket>`)
- Handshake timeout: connections without valid MAC are killed after 15s
- Automatic DB status sync: marks display ONLINE on connect, OFFLINE on disconnect
- API endpoints:
  - `GET /api/devices/online` — list all connected devices (IP, port, connected-at, last-seen)
  - `GET /api/displays/:id/status` — check if a specific device is online
- Graceful shutdown: closes all device sockets on backend stop

### 9. RSS Feed Integration (End-to-End)
- **Preset RSS map**: 15+ sources (CNBC, Fox News, NPR, BBC, ESPN, CNN, NYT, Yahoo Finance, etc.)
- **Custom URL support**: dropdown's last option is "Custom URL..." — reveals a text input for any RSS feed
- **Feed fetching**: uses `rss-parser` library, strips HTML tags from summaries
- **MCS encoding**: converts RSS items into scroll-left LED display content with font/color/separator control codes
- **Two publish modes**:
  - `PM` (Play Message): temporary overlay — disappears on device restart
  - `AA` (Add to playlist): permanent — persists in device memory
- **Frontend UX**: Fetch Preview button (shows feed items before publishing) + Publish to Device button
- API endpoints:
  - `GET /api/feeds/rss/presets` — list all preset RSS sources + Custom URL sentinel
  - `GET /api/feeds/rss/fetch?url=...&limit=...` — fetch & parse any RSS feed
  - `POST /api/displays/:id/rss-publish` — fetch → encode → send MCS packet to device

### 10. Mock Data Feeds (Stocks & Sports)
- **Stocks**: Mock price quotes with random walk simulation for popular symbols (AAPL, MSFT, etc.)
- **Sports**: Mock scoreboard for MLB/NFL/NBA/NHL with random scores and game statuses
- Configurable display options (layout, colors, show currency/exchange for stocks; show broadcast/venue for sports)

### 11. UI Theme & Branding
- Theme: Green (Emerald palette)
- Logo: daycom (green rounded square + white "d")
- Login page: dark green gradient background
- Browser title: daycom — LED Display Management

## Demo Accounts

| Email | Password | Role | Visible Scope |
|---|---|---|---|
| superadmin@demo.com | demo123 | SUPER_ADMIN | All 3 organizations |
| admin@demo.com | demo123 | ORG_OWNER | Only Cahoy organization |

## Key File Index

### Backend — Core Services
| File | Description |
|---|---|
| `apps/backend/src/index.ts` | Express app entry point — starts REST API + Device Portal TCP server |
| `apps/backend/src/services/deviceServer.ts` | **Device Portal TCP server** — accepts xPico 240 inbound connections, MAC handshake, connection registry |
| `apps/backend/src/services/mcsService.ts` | **MCS Protocol** — packet builders (PO/PF/PR/CM/ST/SD) + command sender via TCP socket |
| `apps/backend/src/services/rssService.ts` | **RSS Feed** — preset map, feed fetching/parsing, MCS content encoding (PM + AA modes) |
| `apps/backend/src/utils/prisma.ts` | Prisma Client singleton |
| `apps/backend/src/config/env.ts` | Environment variable validation |

### Backend — Routes
| File | Description |
|---|---|
| `apps/backend/src/routes/auth.routes.ts` | Authentication routes (login/me) |
| `apps/backend/src/routes/organization.routes.ts` | Organization CRUD + data isolation |
| `apps/backend/src/routes/display.routes.ts` | Display CRUD + status + online devices + device command |
| `apps/backend/src/routes/user.routes.ts` | User management + data isolation |
| `apps/backend/src/routes/playlist.routes.ts` | Playlist + Playlist Items CRUD |
| `apps/backend/src/routes/feed.routes.ts` | RSS/Stocks/Sports feeds + RSS publish to device |

### Backend — Middleware & Utils
| File | Description |
|---|---|
| `apps/backend/src/middleware/auth.ts` | requireAuth + requireRole middleware |
| `apps/backend/src/middleware/errorHandler.ts` | Error handling middleware (AppError class) |
| `apps/backend/src/utils/jwt.ts` | JWT token signing/verification |
| `apps/backend/src/utils/password.ts` | Password hashing (bcrypt) |
| `apps/backend/src/utils/permissions.ts` | Permission utilities (orgScope/assertOrgResource) |
| `apps/backend/prisma/schema.prisma` | Database model definitions |

### Frontend — Pages & Components
| File | Description |
|---|---|
| `apps/frontend/src/App.tsx` | Route configuration + hydrate |
| `apps/frontend/src/components/Layout.tsx` | Sidebar + topbar (daycom logo + role menu) |
| `apps/frontend/src/components/ProtectedRoute.tsx` | Route guard |
| `apps/frontend/src/components/DeviceControlPopover.tsx` | **Device control** — "i" icon → Power/Restart/Clear/SyncTime commands |
| `apps/frontend/src/components/forms/PlaylistItemForm.tsx` | **Playlist item editor** — 9 type tabs (Message/RSS/Image/Stocks/Sports/...) |
| `apps/frontend/src/components/forms/OrganizationForm.tsx` | Organization create/edit form |
| `apps/frontend/src/components/forms/DisplayForm.tsx` | Display create/edit form |
| `apps/frontend/src/components/ui/Modal.tsx` | Reusable modal component |
| `apps/frontend/src/components/ui/Toast.tsx` | Toast notification |
| `apps/frontend/src/pages/LoginPage.tsx` | Login page (daycom logo + green gradient) |
| `apps/frontend/src/pages/OrganizationListPage.tsx` | Organization list page (CRUD + expand to see displays) |
| `apps/frontend/src/pages/DisplayDetailPage.tsx` | Display detail page (config + playlist + device control) |

### Frontend — Services & State
| File | Description |
|---|---|
| `apps/frontend/src/stores/authStore.ts` | Zustand auth state (token + user + hydrate) |
| `apps/frontend/src/services/api.ts` | Axios instance + interceptors |
| `apps/frontend/src/services/organizations.ts` | **Business API layer** — all REST calls (orgs, displays, playlists, feeds, devices, RSS) |
| `apps/frontend/src/types/index.ts` | Business types + role utilities + RSS/feed types |

## Service Ports

| Service | Port | Start Command |
|---|---|---|
| PostgreSQL | 5432 | Workspace PGDATA directory |
| Backend REST API | 4000 | `cd apps/backend && npm run dev` |
| Device Portal TCP | 5000 | (auto-started with backend) |
| Frontend Vite | 5173 | `cd apps/frontend && npm run dev` |

## How the Device Communication Works (Quick Reference)

```
1. xPico 240 boots → connects to backend TCP port 5000
2. xPico sends MAC address (e.g. "0080A3EE051F") as first message
3. Backend normalizes MAC → AA:BB:CC:DD:EE:FF format
4. Backend stores socket in connection registry (Map<MAC, socket>)
5. Backend marks display as ONLINE in database

--- Later, user clicks "Power On" in web UI ---

6. Frontend calls POST /api/displays/:id/command { command: 'power-on' }
7. Backend looks up MAC from display record
8. Backend checks connection registry for active socket
9. Backend builds MCS packet: ^B00^ACPO^C
10. Backend writes packet to socket (ASCII encoding)
11. xPico 240 forwards packet to LED ticker via serial
12. LED ticker powers on
13. Backend waits for ^C-terminated response (or timeout)
14. Backend returns result to frontend
15. Frontend shows success/error toast
```

## How RSS Publishing Works (Quick Reference)

```
1. User selects an RSS preset (or enters Custom URL) in PlaylistItemForm
2. User clicks "Fetch Preview" → frontend calls GET /api/feeds/rss/fetch?url=...
3. Backend fetches & parses the RSS feed → returns structured items
4. Frontend displays item list (title, summary, date)
5. User clicks "Publish to Device"
6. Frontend calls POST /api/displays/:id/rss-publish { url, mode, config }
7. Backend re-fetches the feed (ensures fresh content)
8. Backend encodes items into MCS content string:
   - Scroll-left effect: ^E$SCL1$
   - Font: ^F$SS16$
   - Color: ^O$F:#FFFFFF$
   - Story separator: ^L (new page)
9. Backend wraps content in MCS packet:
   - PM mode: ^B01^ACPM{content}^C  (temporary overlay)
   - AA mode: ^B01^ACSMAT{hexsize}^AAA{content}^C  (permanent playlist)
10. Backend sends packet through Device Portal TCP connection
11. LED ticker displays scrolling RSS headlines
```

## Todo (Next Steps)

- [ ] User management page (ORG_OWNER manages org members)
- [ ] Bulk operations page (Bulk Actions)
- [ ] Premium Content management
- [ ] Report pages (Ticker/Digital Subscription Report)
- [ ] Map pages (Finance/Sports/RSS Map)
- [ ] Data Center page (SUPER_ADMIN only)
- [ ] Playlist publishing to device (push entire playlist, not just RSS)
- [ ] Stock/Sports feed → MCS encoding (same pattern as RSS)
- [ ] Scheduled content rotation (cron-based playlist scheduling)
- [ ] Real-time device status via WebSocket (instead of polling)
- [ ] Image upload to device via MCS protocol
- [ ] Fix pre-existing TypeScript errors in playlist.routes.ts (Prisma schema field mismatch)

## Known Issues

- `playlist.routes.ts` has 5 pre-existing TypeScript errors (Prisma `name`/`icon`/`config` fields not in schema) — does not affect runtime via `ts-node-dev --transpile-only`
- WSJ RSS URL has a typo (`a]]z.com`) — needs correction before production use
- Device Portal TCP server has no authentication — any device can connect. Production should add a pre-shared key or certificate-based auth
