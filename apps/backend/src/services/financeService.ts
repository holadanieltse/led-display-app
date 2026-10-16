// 股票行情服务：Yahoo Finance 公开 chart endpoint（无需 API Key）
// 参考 endpoint: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d

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

const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36'

// ====== 简单内存缓存：TTL 5 分钟 ======
type CacheEntry<T> = { data: T; expiresAt: number }
const quoteCache = new Map<string, CacheEntry<StockQuote>>()
const QUOTE_TTL_MS = 5 * 60 * 1000

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

type YFChartMeta = {
  symbol: string
  currency?: string
  exchangeName?: string
  fullExchangeName?: string
  regularMarketPrice: number
  chartPreviousClose?: number
  previousClose?: number
  longName?: string
  shortName?: string
}
type YFChartResponse = {
  chart: {
    result: Array<{ meta: YFChartMeta }> | null
    error?: { code?: string; description?: string } | null
  }
}

export async function fetchStockQuote(symbol: string): Promise<StockQuote> {
  const sym = symbol.trim().toUpperCase()
  const cached = getCached<StockQuote>(quoteCache, sym)
  if (cached) return cached

  const url = `${BASE_URL}/${encodeURIComponent(sym)}?interval=1d&range=1d`
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  })
  if (!resp.ok) {
    throw new Error(`Yahoo Finance error: HTTP ${resp.status} for ${sym}`)
  }
  const json = (await resp.json()) as YFChartResponse
  const result = json.chart?.result?.[0]
  if (!result || !result.meta || json.chart?.error) {
    const desc = json.chart?.error?.description || `No result for symbol ${sym}`
    throw new Error(desc)
  }
  const meta = result.meta
  const price = meta.regularMarketPrice
  const prev = meta.previousClose ?? meta.chartPreviousClose ?? price
  const change = Number((price - prev).toFixed(4))
  const changePercent = Number(((change / (prev || 1)) * 100).toFixed(3))

  const quote: StockQuote = {
    symbol: meta.symbol,
    name: meta.longName || meta.shortName || null,
    price,
    previousClose: prev,
    change,
    changePercent,
    currency: meta.currency || 'USD',
    exchange: meta.fullExchangeName || meta.exchangeName || null,
    fetchedAt: new Date().toISOString(),
  }
  setCached(quoteCache, sym, quote, QUOTE_TTL_MS)
  return quote
}

export async function fetchStockQuotes(symbols: string[]): Promise<{ results: StockQuote[]; errors: Array<{ symbol: string; message: string }> }> {
  const results: StockQuote[] = []
  const errors: Array<{ symbol: string; message: string }> = []

  const deduped = Array.from(new Set(symbols.map((s) => s.trim()).filter(Boolean)))

  // 串行 6 个一组避免 rate limit
  const batchSize = 6
  for (let i = 0; i < deduped.length; i += batchSize) {
    const batch = deduped.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (sym) => {
        try {
          const q = await fetchStockQuote(sym)
          results.push(q)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push({ symbol: sym, message: msg })
        }
      }),
    )
  }

  // 按照用户输入顺序返回
  results.sort((a, b) => {
    const ai = deduped.indexOf(a.symbol)
    const bi = deduped.indexOf(b.symbol)
    return ai - bi
  })
  return { results, errors }
}

// 预设常用股票代码（用于前端下拉）
export const POPULAR_STOCKS: Array<{ symbol: string; name: string; market: string }> = [
  // 美股
  { symbol: 'AAPL', name: 'Apple Inc.', market: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', market: 'NASDAQ' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', market: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', market: 'NASDAQ' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', market: 'NASDAQ' },
  { symbol: 'META', name: 'Meta Platforms Inc.', market: 'NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla Inc.', market: 'NASDAQ' },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway (B)', market: 'NYSE' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', market: 'NYSE' },
  { symbol: 'V', name: 'Visa Inc.', market: 'NYSE' },
  { symbol: 'DIS', name: 'The Walt Disney Co.', market: 'NYSE' },
  { symbol: 'NFLX', name: 'Netflix Inc.', market: 'NASDAQ' },
  // 指数 ETF
  { symbol: 'SPY', name: 'S&P 500 ETF', market: 'NYSE' },
  { symbol: 'QQQ', name: 'NASDAQ 100 ETF', market: 'NASDAQ' },
  { symbol: 'DIA', name: 'Dow Jones ETF', market: 'NYSE' },
  // 主要市场指数（Yahoo Finance 支持 ^ 开头）
  { symbol: '^GSPC', name: 'S&P 500 Index', market: 'S&P' },
  { symbol: '^DJI', name: 'Dow Jones Industrial Average', market: 'DJI' },
  { symbol: '^IXIC', name: 'NASDAQ Composite', market: 'NASDAQ' },
  // 加拿大
  { symbol: 'SHOP', name: 'Shopify Inc.', market: 'NYSE' },
  // 欧洲
  { symbol: 'VOW3.DE', name: 'Volkswagen AG', market: 'XETRA' },
  { symbol: 'BMW.DE', name: 'BMW AG', market: 'XETRA' },
  { symbol: 'AIR.PA', name: 'Airbus SE', market: 'Paris' },
  // 亚太
  { symbol: '7203.T', name: 'Toyota Motor Corp.', market: 'TSE' },
  { symbol: '9984.T', name: 'SoftBank Group Corp.', market: 'TSE' },
  { symbol: '0700.HK', name: 'Tencent Holdings Ltd.', market: 'HKEX' },
  { symbol: '9988.HK', name: 'Alibaba Group (HK)', market: 'HKEX' },
]
