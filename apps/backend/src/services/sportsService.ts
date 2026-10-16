// 体育赛事比分服务：ESPN 公开隐藏 API（无需 API Key）
// 文档参考: https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard

export type SportLeague = {
  key: string            // 配置中存储的 value，例如 "football/nfl"
  label: string          // 界面显示："NFL - Football"
  sport: string          // football | basketball | baseball | hockey | soccer
  league: string         // nfl | nba | mlb | nhl | eng.1 等
  region?: string        // espn region (默认 us)
  icon: string           // 显示 emoji 图标
}

export const SPORT_LEAGUES: SportLeague[] = [
  // 北美主要联赛
  { key: 'football/nfl',              label: 'NFL - Football',              sport: 'football',   league: 'nfl',                    icon: '🏈' },
  { key: 'basketball/nba',            label: 'NBA - Basketball',            sport: 'basketball', league: 'nba',                    icon: '🏀' },
  { key: 'baseball/mlb',              label: 'MLB - Baseball',              sport: 'baseball',   league: 'mlb',                    icon: '⚾' },
  { key: 'hockey/nhl',                label: 'NHL - Hockey',                sport: 'hockey',     league: 'nhl',                    icon: '🏒' },
  // 足球
  { key: 'soccer/usa.1',              label: 'MLS - USA Soccer',            sport: 'soccer',     league: 'usa.1',                  icon: '⚽' },
  { key: 'soccer/eng.1',              label: 'Premier League (England)',    sport: 'soccer',     league: 'eng.1',                  icon: '⚽' },
  { key: 'soccer/esp.1',              label: 'La Liga (Spain)',             sport: 'soccer',     league: 'esp.1',                  icon: '⚽' },
  { key: 'soccer/ita.1',              label: 'Serie A (Italy)',             sport: 'soccer',     league: 'ita.1',                  icon: '⚽' },
  { key: 'soccer/ger.1',              label: 'Bundesliga (Germany)',        sport: 'soccer',     league: 'ger.1',                  icon: '⚽' },
  { key: 'soccer/fra.1',              label: 'Ligue 1 (France)',            sport: 'soccer',     league: 'fra.1',                  icon: '⚽' },
  { key: 'soccer/uefa.champions',     label: 'UEFA Champions League',       sport: 'soccer',     league: 'uefa.champions',         icon: '🏆' },
  // 大学联赛（可选）
  { key: 'basketball/mens-college-basketball', label: 'NCAA Men\'s Basketball', sport: 'basketball', league: 'mens-college-basketball', icon: '🎓' },
  { key: 'football/college-football', label: 'NCAA College Football',       sport: 'football',   league: 'college-football',       icon: '🎓' },
]

export type SportsCompetitor = {
  id: string
  name: string           // 例如 "Cowboys"
  abbreviation: string   // 例如 "DAL"
  location: string       // 例如 "Dallas"
  displayName: string    // 例如 "Dallas Cowboys"
  score: string          // "21" 或 ""（未开始）
  logo: string | null
  color: string | null   // 十六进制颜色值，不带 #
  isHome?: boolean
  isWinner?: boolean
}

export type SportsGame = {
  id: string
  name: string           // "Dallas Cowboys at Philadelphia Eagles"
  shortName: string      // "DAL at PHI"
  leagueKey: string
  status: 'scheduled' | 'in' | 'final' | 'halftime' | 'postponed'
  statusText: string     // "1st Quarter", "Final", "7:30 PM ET", 等等
  venue?: string
  date: string           // ISO 时间（开球/开哨）
  homeTeam: SportsCompetitor
  awayTeam: SportsCompetitor
  broadcast?: string     // 例如 "ABC", "ESPN"
  lastPlay?: string      // 最后一回合描述（如果有）
}

type ESPNCompetitor = {
  team: {
    id: string
    name: string
    abbreviation?: string
    location?: string
    displayName?: string
    shortDisplayName?: string
    logo?: string
    color?: string
  }
  score?: string
  winner?: boolean
  homeAway?: 'home' | 'away'
}

interface ESPNEvent {
  id: string
  name: string
  shortName?: string
  date: string
  status?: { type?: { state?: string; shortDetail?: string; detail?: string; name?: string } }
  competitions?: Array<{
    venue?: { fullName?: string; address?: { city?: string; state?: string } }
    competitors?: ESPNCompetitor[]
    broadcast?: Array<{ names?: string[]; market?: string }>
    situation?: { lastPlay?: { text?: string } }
    odds?: Array<{ details?: string }>
  }>
}

type ESPNScoreboardResponse = {
  events?: ESPNEvent[]
  leagues?: unknown[]
}

// ====== 缓存：30 秒 TTL，比分是相对实时数据，但也不要频繁打 ======
type CacheEntry<T> = { data: T; expiresAt: number }
const scoreCache = new Map<string, CacheEntry<SportsGame[]>>()
const SCORE_TTL_MS = 30 * 1000

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}
function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36'

function mapStatus(raw: string | undefined): SportsGame['status'] {
  if (!raw) return 'scheduled'
  switch (raw) {
    case 'in':
      return 'in'
    case 'final':
    case 'post_final':
      return 'final'
    case 'halftime':
      return 'halftime'
    case 'postponed':
      return 'postponed'
    case 'pre':
    case 'warmup':
    case 'pregame':
      return 'scheduled'
    default:
      return 'scheduled'
  }
}

function buildCompetitor(c: ESPNCompetitor, isHome: boolean): SportsCompetitor {
  return {
    id: c.team.id,
    name: c.team.name || 'Team',
    abbreviation: c.team.abbreviation ?? c.team.name.slice(0, 3).toUpperCase(),
    location: c.team.location ?? '',
    displayName: c.team.displayName ?? c.team.shortDisplayName ?? c.team.name,
    score: c.score ?? '',
    logo: c.team.logo ?? null,
    color: c.team.color ?? null,
    isHome,
    isWinner: !!c.winner,
  }
}

export async function fetchSportsScores(leagueKey: string, yyyymmdd?: string): Promise<SportsGame[]> {
  const league = SPORT_LEAGUES.find((l) => l.key === leagueKey)
  if (!league) throw new Error(`Unknown sports league: ${leagueKey}`)

  const cacheKey = yyyymmdd ? `${leagueKey}:${yyyymmdd}` : leagueKey
  const cached = getCached<SportsGame[]>(scoreCache, cacheKey)
  if (cached) return cached

  let url = `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/scoreboard`
  if (yyyymmdd) {
    url += `?dates=${encodeURIComponent(yyyymmdd)}`
  }

  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  })
  if (!resp.ok) {
    throw new Error(`ESPN API error: HTTP ${resp.status} for ${leagueKey}`)
  }
  const json = (await resp.json()) as ESPNScoreboardResponse
  const events = json.events ?? []

  const games: SportsGame[] = events.map((e) => {
    const competitors = e.competitions?.[0]?.competitors ?? []
    const home = competitors.find((c) => c.homeAway === 'home')
    const away = competitors.find((c) => c.homeAway === 'away')
    const homeC = home ?? competitors[0]
    const awayC = away ?? competitors[1]

    const broadcast = e.competitions?.[0]?.broadcast?.[0]?.names?.[0]
    const venue = e.competitions?.[0]?.venue?.fullName

    const rawStatus = e.status?.type?.state
    const status = mapStatus(rawStatus)
    const statusText =
      e.status?.type?.shortDetail ??
      e.status?.type?.detail ??
      e.status?.type?.name ??
      (new Date(e.date).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }))

    return {
      id: e.id,
      name: e.name,
      shortName: e.shortName ?? e.name,
      leagueKey,
      status,
      statusText,
      venue,
      date: e.date,
      homeTeam: buildCompetitor(homeC, true),
      awayTeam: buildCompetitor(awayC, false),
      broadcast,
      lastPlay: e.competitions?.[0]?.situation?.lastPlay?.text,
    }
  })

  setCached(scoreCache, cacheKey, games, SCORE_TTL_MS)
  return games
}
