// Feed routes：股票行情 / 体育比分 / RSS Feed 的预览 + 预设元数据
// RSS Feed 现在使用真实 rss-parser 抓取 + MCS 协议编码
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { assertOrgResource } from '../utils/permissions'
import { prisma } from '../utils/prisma'
import {
  RSS_PRESETS,
  CUSTOM_URL_SENTINEL,
  fetchRssFeed,
  buildRssTextPacket,
  buildRssVariablePacket,
  type RssMcsConfig,
} from '../services/rssService'
import { getActiveConnection, sendPacketToMac } from '../services/deviceServer'
import {
  buildMessageMcsPacket,
  buildMessageVariablePacket,
  assertNoDeviceError,
  MESSAGE_WRITE_WAIT_SEC,
  WAIT_TIME_SEC,
  type MessageMcsConfig,
} from '../services/mcsService'

const router = Router()

// ================== Schemas ==================

const stocksQuerySchema = z.object({
  symbols: z
    .string()
    .min(1, 'symbols is required')
    .max(600, 'Too many symbols'),
})

const sportsQuerySchema = z.object({
  league: z.string().min(1, 'league key is required'),
  date: z
    .string()
    .regex(/^\d{8}$/, 'date must be YYYYMMDD')
    .optional(),
})

// ================== Mock Presets ==================

const POPULAR_STOCKS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'META', name: 'Meta Platforms' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'JPM', name: 'JPMorgan Chase' },
  { symbol: 'V', name: 'Visa Inc.' },
  { symbol: 'DIS', name: 'Walt Disney Co.' },
  { symbol: 'BA', name: 'Boeing Co.' },
]

const SPORT_LEAGUES = [
  { key: 'baseball/mlb', name: 'MLB', label: 'Major League Baseball' },
  { key: 'football/nfl', name: 'NFL', label: 'National Football League' },
  { key: 'basketball/nba', name: 'NBA', label: 'National Basketball Association' },
  { key: 'hockey/nhl', name: 'NHL', label: 'National Hockey League' },
  { key: 'soccer/{league}', name: 'Soccer', label: 'Soccer (generic)' },
]

// ================== Preset endpoints ==================

/**
 * GET /api/feeds/stocks/popular
 * 热门股票代码列表（给前端下拉用）
 */
router.get('/feeds/stocks/popular', requireAuth, (_req: Request, res: Response) => {
  res.json({ success: true, data: POPULAR_STOCKS })
})

/**
 * GET /api/feeds/sports/leagues
 * 支持的体育联赛列表（给前端下拉用）
 */
router.get('/feeds/sports/leagues', requireAuth, (_req: Request, res: Response) => {
  res.json({ success: true, data: SPORT_LEAGUES })
})

// ================== Mock: Stocks ==================

function randomPrice(base: number): { price: number; change: number; changePercent: number } {
  const change = (Math.random() - 0.45) * (base * 0.03)
  const price = Math.max(0.01, base + change)
  return {
    price: Number(price.toFixed(2)),
    change: Number(change.toFixed(2)),
    changePercent: Number(((change / base) * 100).toFixed(2)),
  }
}

const MOCK_BASE_PRICES: Record<string, number> = {
  AAPL: 228.5,
  MSFT: 420.1,
  GOOGL: 178.3,
  AMZN: 195.6,
  TSLA: 252.4,
  NVDA: 131.8,
  META: 555.2,
  NFLX: 735.1,
  JPM: 218.9,
  V: 282.5,
  DIS: 97.2,
  BA: 168.4,
}

/**
 * GET /api/feeds/stocks/quotes?symbols=AAPL,MSFT,GOOGL
 * Mock 股票行情
 */
router.get('/feeds/stocks/quotes', requireAuth, async (req: Request, res: Response) => {
  const query = stocksQuerySchema.parse(req.query)
  const symbols = query.symbols
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)

  if (symbols.length === 0) {
    res.status(400).json({ success: false, error: 'No symbols provided' })
    return
  }
  if (symbols.length > 50) {
    res.status(400).json({ success: false, error: 'Maximum 50 symbols per request' })
    return
  }

  const quotes = symbols.map((s) => {
    const base = MOCK_BASE_PRICES[s] ?? 100 + Math.random() * 400
    const { price, change, changePercent } = randomPrice(base)
    const name =
      POPULAR_STOCKS.find((p) => p.symbol === s)?.name ?? `Company ${s}`
    return {
      symbol: s,
      name,
      price,
      change,
      changePercent,
      currency: 'USD',
      exchange: 'NASDAQ',
      updatedAt: new Date().toISOString(),
      isMock: true,
    }
  })

  res.json({
    success: true,
    data: { quotes, errors: [] as string[] },
  })
})

// ================== Mock: Sports ==================

const MOCK_TEAMS: Record<string, { home: string; away: string }[]> = {
  'baseball/mlb': [
    { home: 'New York Yankees', away: 'Boston Red Sox' },
    { home: 'Los Angeles Dodgers', away: 'San Francisco Giants' },
    { home: 'Houston Astros', away: 'Texas Rangers' },
    { home: 'Atlanta Braves', away: 'New York Mets' },
  ],
  'football/nfl': [
    { home: 'Kansas City Chiefs', away: 'Buffalo Bills' },
    { home: 'San Francisco 49ers', away: 'Dallas Cowboys' },
    { home: 'Green Bay Packers', away: 'Chicago Bears' },
  ],
  'basketball/nba': [
    { home: 'Los Angeles Lakers', away: 'Boston Celtics' },
    { home: 'Golden State Warriors', away: 'Phoenix Suns' },
    { home: 'Denver Nuggets', away: 'Miami Heat' },
  ],
  'hockey/nhl': [
    { home: 'Tampa Bay Lightning', away: 'New York Rangers' },
    { home: 'Vegas Golden Knights', away: 'Colorado Avalanche' },
  ],
}

/**
 * GET /api/feeds/sports/scoreboard?league=baseball/mlb[&date=20250815]
 * Mock 体育比分牌
 */
router.get('/feeds/sports/scoreboard', requireAuth, async (req: Request, res: Response) => {
  const query = sportsQuerySchema.parse(req.query)
  const matchups = MOCK_TEAMS[query.league] ?? [
    { home: 'Team A', away: 'Team B' },
    { home: 'Team C', away: 'Team D' },
  ]

  const games = matchups.map((m, idx) => {
    const homeScore = Math.floor(Math.random() * 8)
    const awayScore = Math.floor(Math.random() * 8)
    const statusRoll = Math.random()
    const status = statusRoll < 0.5 ? 'IN_PROGRESS' : statusRoll < 0.85 ? 'FINAL' : 'SCHEDULED'
    return {
      id: `mock-${query.league}-${idx}`,
      league: query.league,
      status,
      statusDetail: status === 'IN_PROGRESS' ? `Q${Math.floor(Math.random() * 4) + 1}` : status === 'FINAL' ? 'Final' : '7:00 PM',
      homeTeam: {
        id: `home-${idx}`,
        name: m.home,
        abbreviation: m.home.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 3),
        score: status === 'SCHEDULED' ? undefined : homeScore,
        logo: '',
      },
      awayTeam: {
        id: `away-${idx}`,
        name: m.away,
        abbreviation: m.away.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 3),
        score: status === 'SCHEDULED' ? undefined : awayScore,
        logo: '',
      },
      broadcast: status === 'SCHEDULED' ? 'ESPN' : undefined,
      scheduledAt: new Date(Date.now() + idx * 3600_000).toISOString(),
      isMock: true,
    }
  })

  res.json({ success: true, data: games })
})

// ================== RSS Feed ==================

const rssFetchSchema = z.object({
  url: z.string().url('Must be a valid URL').min(1, 'url is required'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

const rssPublishSchema = z.object({
  url: z.string().url('Must be a valid URL').min(1, 'url is required'),
  // 'text' writes text file "A" (restarts); 'variable' writes $F00$ (no restart)
  mode: z.enum(['text', 'variable']).default('text'),
  config: z.object({
    showTitle: z.boolean().default(true),
    showSummary: z.boolean().default(false),
    numStories: z.coerce.number().int().min(1).max(50).default(5),
    font: z.string().default('Standard'),
    fontSize: z.coerce.number().int().min(7).max(64).default(16),
    color: z.string().default('#FFFFFF'),
    storySeparator: z.string().default('#FFFFFF'),
  }).optional(),
})

/**
 * GET /api/feeds/rss/presets
 * List all preset RSS sources for the frontend dropdown.
 */
router.get('/feeds/rss/presets', requireAuth, (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: [
      ...RSS_PRESETS,
      { label: 'Custom URL...', url: CUSTOM_URL_SENTINEL },
    ],
  })
})

/**
 * GET /api/feeds/rss/fetch?url=...&limit=10
 * Fetch and parse an RSS feed, returning structured items.
 * Supports both RSS and Atom formats.
 */
router.get('/feeds/rss/fetch', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = rssFetchSchema.parse(req.query)
    const result = await fetchRssFeed(query.url, query.limit)
    res.json({ success: true, data: result })
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(err.errors.map((e) => e.message).join('; '), 400))
    } else {
      next(err)
    }
  }
})

/**
 * POST /api/displays/:id/rss-publish
 * Fetch an RSS feed, encode its content into MCS protocol, and send to the device.
 *
 * Body: { url, mode: 'text'|'variable', config: { showTitle, showSummary, numStories, font, fontSize, color, storySeparator } }
 *
 * - mode='text':     write text file "A" — becomes displayed content, restarts
 * - mode='variable': write variable "$F00$" — live update, no restart
 *
 * MCS v3.1: one packet, then wait for `ok`/WT before the next. No queueing.
 */
router.post(
  '/displays/:id/rss-publish',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const body = rssPublishSchema.parse(req.body)

      // Load display with org isolation
      const display = await prisma.display.findUnique({ where: { id } })
      if (!display) throw new AppError('Display not found', 404)
      assertOrgResource(req, display.orgId)

      // Fetch RSS feed
      const feed = await fetchRssFeed(body.url, body.config?.numStories ?? 5)

      // Build MCS config
      const cfg: RssMcsConfig = body.config ?? {
        showTitle: true,
        showSummary: false,
        numStories: 5,
        font: 'Standard',
        fontSize: 16,
        color: '#FFFFFF',
        storySeparator: '#FFFFFF',
      }

      // Build MCS packet — always address 01 (single device)
      const isVariable = body.mode === 'variable'
      const packet = isVariable
        ? buildRssVariablePacket(feed.items, cfg, '$F00$', '01')
        : buildRssTextPacket(feed.items, cfg, '01')
      const waitSec = isVariable ? WAIT_TIME_SEC.variableWrite : WAIT_TIME_SEC.playlistWrite

      const conn = getActiveConnection(display.macAddress)
      if (!conn) {
        throw new AppError(
          `Device ${display.macAddress} is not online. ` +
          'The xPico 240 must connect to the Device Portal before publishing RSS content.',
          502,
        )
      }

      // sendPacketToMac holds the per-device lock for the WT → no command queueing
      const response = await sendPacketToMac(display.macAddress, packet, 15000, waitSec * 1000)
      assertNoDeviceError(response, 'publishing RSS content')

      res.json({
        success: true,
        data: {
          displayId: id,
          displayName: display.name,
          macAddress: display.macAddress,
          feedTitle: feed.feedTitle,
          itemsSent: feed.items.length,
          mode: body.mode,
          packetPreview: packet.slice(0, 200) + (packet.length > 200 ? '...' : ''),
          response: response || '(no response)',
          ip: conn.remoteIp,
        },
      })
    } catch (err) {
      if (err instanceof z.ZodError) {
        next(new AppError(err.errors.map((e) => e.message).join('; '), 400))
      } else if (err instanceof Error && (err.message.includes('not online') || err.message.includes('TCP') || err.message.includes('Write error') || err.message.includes('busy') || err.message.includes('reported'))) {
        next(new AppError(err.message, 502))
      } else {
        next(err)
      }
    }
  },
)

// ================== Message Publish ==================

const messagePublishSchema = z.object({
  text: z.string().min(1, 'Message text is required').max(2000, 'Message too long'),
  // 'text' writes text file "A" (restarts); 'variable' writes $F00$ (no restart)
  mode: z.enum(['text', 'variable']).default('text'),
  config: z.object({
    font: z.string().default('Standard'),
    fontSize: z.coerce.number().int().min(7).max(64).default(16),
    color: z.string().default('#FFFFFF'),
  }).optional(),
})

/**
 * POST /api/displays/:id/message-publish
 * Encode a plain text message into MCS protocol and send to the device.
 *
 * Body: { text, mode: 'text'|'variable', config: { font, fontSize, color } }
 *
 * - mode='text':     write text file "A" — the message becomes the displayed
 *                    content and triggers a full restart (doc §9/§10).
 * - mode='variable': write variable "$F00$" — live update, no restart; the
 *                    active playlist must reference `^N$F00$` to show it.
 *
 * MCS v3.1 packet (always ^B01 — single device):
 *   text:     ^B01^ACSMAT{size}^D{chk}^AAA{content}^D{chk}^C
 *   variable: ^B01^ACSM$F00$V{size}^D{chk}^ACB$F00${content}^D{chk}^C
 */
router.post(
  '/displays/:id/message-publish',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const body = messagePublishSchema.parse(req.body)

      const display = await prisma.display.findUnique({ where: { id } })
      if (!display) throw new AppError('Display not found', 404)
      assertOrgResource(req, display.orgId)

      const cfg: MessageMcsConfig = body.config ?? {
        font: 'Standard',
        fontSize: 16,
        color: '#FFFFFF',
      }

      // Build MCS packet — always address 01 (single device)
      const isVariable = body.mode === 'variable'
      const packet = isVariable
        ? buildMessageVariablePacket(body.text, cfg, '$F00$', '01')
        : buildMessageMcsPacket(body.text, cfg, '01')
      const waitSec = isVariable ? WAIT_TIME_SEC.variableWrite : MESSAGE_WRITE_WAIT_SEC

      const conn = getActiveConnection(display.macAddress)
      if (!conn) {
        throw new AppError(
          `Device ${display.macAddress} is not online. ` +
          'The xPico 240 must connect to the Device Portal before publishing messages.',
          502,
        )
      }

      // sendPacketToMac holds the per-device lock for the WT → no command queueing
      const response = await sendPacketToMac(display.macAddress, packet, 15000, waitSec * 1000)
      assertNoDeviceError(response, 'publishing the message')

      res.json({
        success: true,
        data: {
          displayId: id,
          displayName: display.name,
          macAddress: display.macAddress,
          mode: body.mode,
          textLength: body.text.length,
          packetPreview: packet.slice(0, 200) + (packet.length > 200 ? '...' : ''),
          response: response || '(no response)',
          ip: conn.remoteIp,
        },
      })
    } catch (err) {
      if (err instanceof z.ZodError) {
        next(new AppError(err.errors.map((e) => e.message).join('; '), 400))
      } else if (err instanceof Error && (err.message.includes('not online') || err.message.includes('TCP') || err.message.includes('Write error') || err.message.includes('busy') || err.message.includes('reported'))) {
        next(new AppError(err.message, 502))
      } else {
        next(err)
      }
    }
  },
)

export default router
