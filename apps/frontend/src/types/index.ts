// 业务实体类型定义（与后端 Prisma 模型对齐）
import type { UserRole } from './auth'

export type DisplayType = 'TICKER' | 'DIGITAL' | 'HTML_FEED'
export type DisplayStatus = 'ONLINE' | 'OFFLINE' | 'ERROR'

// PlaylistItem 类型（完整 9 种 + 兼容老数据 5 种）
export type PlaylistItemType =
  | 'RSS'
  | 'CUSTOM_TEXT'
  | 'HTML'
  | 'IMAGE'
  | 'VIDEO'
  | 'MESSAGE'
  | 'RSS_FEED'
  | 'FINANCIAL_QUOTES'
  | 'SPORTS_SCORES'
  | 'WATCHLIST'
  | 'CUSTOM_CONTENT'
  | 'GOOGLE_SHEETS'
  | 'NEWSROOM'

export type ScheduleType = 'ALWAYS' | 'TIME_RANGE' | 'DATE_RANGE' | 'CUSTOM'

export type Organization = {
  id: string
  name: string
  primaryContactName: string | null
  primaryContactEmail: string | null
  userCount: number
  displayCount: number
  createdAt: string
  updatedAt: string
}

export type Display = {
  id: string
  name: string
  macAddress: string
  signId: string | null
  firmwareVersion: string | null
  tickerHeight: number | null
  type: DisplayType
  status: DisplayStatus
  lastSeenAt: string | null
  timezone: string
  timezoneRegion: string | null
  scrollSpeed: number
  brightness: number
  powerSaveEnabled: boolean
  tickerOnTime: string
  tickerOffTime: string
  scheduledClearRepublish?: string | null
  clearCacheNext?: boolean
  orgId: string
  plans: string[]
  playlists?: (Playlist & { _count: { items: number } })[]
  createdAt: string
  updatedAt: string
}

export type User = {
  id: string
  email: string
  name: string | null
  role: UserRole
  orgId: string
  createdAt: string
  updatedAt: string
}

export type Playlist = {
  id: string
  displayId: string
  name: string
  lastUpdatedAt: string
  lastUpdatedBy: string | null
  isPublished: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  items?: PlaylistItem[]
  _count?: { items: number }
}

export type PlaylistItem = {
  id: string
  playlistId: string
  itemType: PlaylistItemType
  name: string
  icon: string | null
  content: string | null
  mediaUrl: string | null
  config: Record<string, unknown> | null // JSONB 存储的类型特定配置
  displayOrder: number
  scheduleType: ScheduleType
  startTime: string | null
  endTime: string | null
  startDate: string | null
  endDate: string | null
  weekdays: string | null
  createdAt: string
  updatedAt: string
}

// 角色层级（用于前端按钮/菜单显隐判断）
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  USER: 0,
  ORG_ADMIN: 1,
  ORG_OWNER: 2,
  SUPER_ADMIN: 100,
}

export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole]
}

// ============ Feed / 第三方数据类型 ============
export type StockQuote = {
  symbol: string
  name: string | null
  price: number
  previousClose: number
  change: number
  changePercent: number
  currency: string
  exchange: string | null
  fetchedAt: string
}

export type PopularStock = {
  symbol: string
  name: string
  market: string
}

export type SportLeague = {
  key: string
  label: string
  sport: string
  league: string
  icon: string
}

export type SportsCompetitor = {
  id: string
  name: string
  abbreviation: string
  location: string
  displayName: string
  score: string
  logo: string | null
  color: string | null
  isHome?: boolean
  isWinner?: boolean
}

export type SportsGame = {
  id: string
  name: string
  shortName: string
  leagueKey: string
  status: 'scheduled' | 'in' | 'final' | 'halftime' | 'postponed'
  statusText: string
  venue?: string
  date: string
  homeTeam: SportsCompetitor
  awayTeam: SportsCompetitor
  broadcast?: string
  lastPlay?: string
}

// ============ MCS Device Control ============
export type DeviceCommand =
  | 'power-on'
  | 'power-off'
  | 'restart'
  | 'clear-memory'
  | 'sync-time'
  | 'heartbeat'

export type DeviceCommandResult = {
  command: DeviceCommand
  displayId: string
  displayName: string
  macAddress: string
  ip: string | null
  response: string
}

export type DeviceStatus = {
  displayId: string
  macAddress: string
  online: boolean
  remoteIp: string | null
  remotePort: number | null
  connectedAt: string | null
  lastSeenAt: string | null
  dbStatus: DisplayStatus
}

export type RssPreset = { label: string; url: string }

export type RssItem = {
  title: string
  summary: string
  link: string
  pubDate: string
}

export type RssFetchResult = {
  feedTitle: string
  feedUrl: string
  items: RssItem[]
}

export type RssMcsConfig = {
  showTitle: boolean
  showSummary: boolean
  numStories: number
  font: string
  fontSize: number
  color: string
  storySeparator: string
}


