// Playlist Item 创建/编辑表单：9 种类型 Tab + 条件渲染字段
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  MessageCircle, Image as ImageIcon, Radio, BarChart3, Trophy, Star,
  FileText, Table, Newspaper, ChevronDown, RefreshCw, Plus, X, Send,
} from 'lucide-react'
import { playlistItemsApi, feedsApi } from '../../services/organizations'
import { defaultIconForItemType, defaultNameForItemType } from '../../pages/DisplayDetailPage'
import type {
  PlaylistItem,
  PlaylistItemType,
  StockQuote,
  PopularStock,
  SportLeague,
  SportsGame,
  RssPreset,
  RssFetchResult,
  RssItem,
} from '../../types'

// ==================== 类型定义 ====================
type FormTab = {
  type: PlaylistItemType
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: any
}

const TABS: FormTab[] = [
  { type: 'MESSAGE',          label: 'Message',          Icon: MessageCircle },
  { type: 'IMAGE',            label: 'Image',            Icon: ImageIcon },
  { type: 'RSS_FEED',         label: 'RSS Feed',         Icon: Radio },
  { type: 'FINANCIAL_QUOTES', label: 'Financial\nQuotes',Icon: BarChart3 },
  { type: 'SPORTS_SCORES',    label: 'Sports\nScores',   Icon: Trophy },
  { type: 'WATCHLIST',        label: 'Watchlist',        Icon: Star },
  { type: 'CUSTOM_CONTENT',   label: 'Custom\nContent',  Icon: FileText },
  { type: 'GOOGLE_SHEETS',    label: 'Google\nSheets',   Icon: Table },
  { type: 'NEWSROOM',         label: 'Newsroom',         Icon: Newspaper },
]

const COMING_SOON_TYPES: PlaylistItemType[] = [
  'WATCHLIST', 'CUSTOM_CONTENT', 'GOOGLE_SHEETS', 'NEWSROOM',
]

// Stock Quotes 默认显示的代码：AAPL, MSFT（演示用）
const DEFAULT_STOCK_SYMBOLS = 'AAPL, MSFT, GOOGL, AMZN, NVDA'

// 股票显示样式：简洁版（代码 + 价格 + 涨跌 %） / 完整版（带名称）
const STOCK_LAYOUT_OPTIONS = [
  { value: 'compact', label: 'Compact (Symbol + Price + Chg%)' },
  { value: 'full',    label: 'Full (Name + Price + Change)' },
]
const POSITIVE_COLOR_DEFAULT = '#00FF00'
const NEGATIVE_COLOR_DEFAULT = '#FF0000'

// 预设 RSS 源：从后端 API 加载（含 Custom URL sentinel）
// Custom URL sentinel 值 — 与后端 rssService.ts 一致
const CUSTOM_URL_SENTINEL = '__custom__'
const RSS_PRESETS: { label: string; url: string }[] = [
  { label: 'CNBC - Headlines',     url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { label: 'Fox News - Headlines',  url: 'https://moxie.foxnews.com/google-publisher/latest.xml' },
  { label: 'NPR - Headlines',      url: 'https://feeds.npr.org/1001/rss.xml' },
  { label: 'CNBC - Business News', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147' },
  { label: 'NY Times - US News',   url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
  { label: 'Politico - Politics',  url: 'https://www.politico.com/rss/politicopicks.xml' },
  { label: 'BBC - World News',     url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
  { label: 'ESPN - Top Headlines', url: 'https://www.espn.com/espn/rss/news' },
  { label: 'ESPN - NFL',           url: 'https://www.espn.com/espn/rss/nfl/news' },
  { label: 'ESPN - MLB',           url: 'https://www.espn.com/espn/rss/mlb/news' },
  { label: 'ESPN - NBA',           url: 'https://www.espn.com/espn/rss/nba/news' },
  { label: 'Yahoo Finance',        url: 'https://finance.yahoo.com/news/rssindex' },
  { label: 'Reuters - Business',   url: 'https://feeds.reuters.com/reuters/businessNews' },
  { label: 'CNN - Top Stories',    url: 'http://rss.cnn.com/rss/edition.rss' },
  { label: 'The Guardian - US',    url: 'https://www.theguardian.com/us-news/rss' },
  { label: 'Custom URL...',        url: CUSTOM_URL_SENTINEL },
]

const FONT_OPTIONS = ['Standard', 'Bold', 'Condensed', 'Serif']
const FONT_SIZE_OPTIONS = [14, 16, 20, 24, 28, 32, 40, 48, 64]
const COLOR_OPTIONS = ['#FFFFFF', '#00FF00', '#FF0000', '#FFFF00', '#00FFFF', '#FF00FF', '#FFA500', '#808080']
const STORY_COUNT_OPTIONS = [3, 5, 10, 15, 20]

// ==================== Zod Schema ====================
// 使用宽松的 z.record 存储 config，字段由 UI 层保证结构
// 类型特定校验在 onSubmit 中进行（因为要结合 activeType 判断）
const schema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  scheduleAlways: z.boolean().default(true),
  // Message
  messageText: z.string().optional(),
  font: z.string().optional(),
  fontSize: z.coerce.number().int().optional(),
  color: z.string().optional(),
  // RSS Feed
  rssUrl: z.string().optional(),
  customRssUrl: z.string().optional(),
  showTitle: z.boolean().default(true),
  showSummary: z.boolean().default(false),
  numStories: z.coerce.number().int().min(1).default(5),
  storySeparator: z.string().optional(),
  // Financial Quotes (Stocks feed)
  financeSymbols: z.string().optional(),          // 逗号分隔："AAPL, MSFT"
  stockLayout: z.string().optional(),             // 'compact' | 'full'
  positiveColor: z.string().optional(),           // 上涨颜色
  negativeColor: z.string().optional(),           // 下跌颜色
  stockShowCurrency: z.boolean().default(false),  // 是否显示货币标识
  stockShowExchange: z.boolean().default(false),  // 是否显示交易所
  // Sports Scores
  leagueKey: z.string().optional(),               // 'football/nfl' 等
  sportsDate: z.string().optional(),              // YYYYMMDD（可选，空=今日）
  sportsShowBroadcast: z.boolean().default(false),
  sportsShowVenue: z.boolean().default(false),
  sportsShowOnlyFavorites: z.boolean().default(false),
})
type FormData = z.infer<typeof schema>

// 类型特定的运行时校验（在 onSubmit 之前调用）
function validateForType(activeType: PlaylistItemType, data: FormData): string | null {
  if (activeType === 'MESSAGE') {
    const txt = (data.messageText ?? '').trim()
    if (!txt) return 'Message text is required for Message type'
  }
  if (activeType === 'RSS_FEED') {
    const url = (data.rssUrl ?? '').trim()
    if (!url) return 'RSS URL is required for RSS Feed type'
    if (url === CUSTOM_URL_SENTINEL) {
      const custom = (data.customRssUrl ?? '').trim()
      if (!custom) return 'Please enter a custom RSS feed URL'
      if (!/^https?:\/\//i.test(custom)) return 'Custom URL must start with http:// or https://'
    }
  }
  if (activeType === 'FINANCIAL_QUOTES') {
    const syms = (data.financeSymbols ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (syms.length === 0) return 'At least one stock symbol is required'
    if (syms.length > 50) return 'Maximum 50 symbols per playlist item'
  }
  if (activeType === 'SPORTS_SCORES') {
    const key = (data.leagueKey ?? '').trim()
    if (!key) return 'Please select a sports league'
  }
  return null
}

// ==================== Props ====================
type Props = {
  playlistId: string
  editing: PlaylistItem | null // null = 创建
  defaultType: PlaylistItemType
  onClose: () => void
  onSuccess: (msg: string) => void
}

// ==================== 工具函数 ====================
// 从 PlaylistItem.config（可能为 null）读取值，带 fallback
function readConfig<T = unknown>(cfg: Record<string, unknown> | null, key: string, fallback: T): T {
  if (!cfg || cfg[key] === undefined || cfg[key] === null) return fallback
  return cfg[key] as T
}

export function PlaylistItemForm({ playlistId, editing, defaultType, onClose, onSuccess }: Props) {
  const isEdit = !!editing
  const initialType: PlaylistItemType = isEdit ? editing!.itemType : defaultType
  const [activeType, setActiveType] = useState<PlaylistItemType>(initialType)
  const [typeError, setTypeError] = useState<string | null>(null)

  // ============ Feeds 预设 & 预览数据 ============
  const [popularStocks, setPopularStocks] = useState<PopularStock[]>([])
  const [sportLeagues, setSportLeagues] = useState<SportLeague[]>([])
  const [loadingPresets, setLoadingPresets] = useState<boolean>(false)

  const [stockPreview, setStockPreview] = useState<StockQuote[] | null>(null)
  const [stockPreviewLoading, setStockPreviewLoading] = useState<boolean>(false)
  const [stockPreviewError, setStockPreviewError] = useState<string | null>(null)

  const [sportsPreview, setSportsPreview] = useState<SportsGame[] | null>(null)
  const [sportsPreviewLoading, setSportsPreviewLoading] = useState<boolean>(false)
  const [sportsPreviewError, setSportsPreviewError] = useState<string | null>(null)

  // RSS Feed preview state
  const [rssPreview, setRssPreview] = useState<RssFetchResult | null>(null)
  const [rssPreviewLoading, setRssPreviewLoading] = useState<boolean>(false)
  const [rssPreviewError, setRssPreviewError] = useState<string | null>(null)
  const [rssPublishing, setRssPublishing] = useState<boolean>(false)
  const [rssPublishResult, setRssPublishResult] = useState<string | null>(null)

  // Message publish state
  const [msgPublishing, setMsgPublishing] = useState<boolean>(false)
  const [msgPublishResult, setMsgPublishResult] = useState<string | null>(null)
  const [msgPublishError, setMsgPublishError] = useState<string | null>(null)

  // 初始化时加载热门股票 & 体育联赛预设
  useEffect(() => {
    let cancelled = false
    async function loadPresets() {
      setLoadingPresets(true)
      try {
        const [stocks, leagues] = await Promise.all([
          feedsApi.popularStocks().catch(() => []),
          feedsApi.sportLeagues().catch(() => []),
        ])
        if (!cancelled) {
          setPopularStocks(stocks)
          setSportLeagues(leagues)
        }
      } finally {
        if (!cancelled) setLoadingPresets(false)
      }
    }
    loadPresets()
    return () => {
      cancelled = true
    }
  }, [])

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      scheduleAlways: true,
      font: 'Standard',
      fontSize: 28,
      color: '#FFFFFF',
      showTitle: true,
      showSummary: false,
      numStories: 5,
      storySeparator: '#FFFFFF',
    },
  })

  // ============ 初始化表单值 ============
  useEffect(() => {
    if (isEdit && editing) {
      // 编辑模式：从 name + config 读取
      const cfg = editing.config
      const itemType = editing.itemType
      setActiveType(itemType)

      reset({
        name: editing.name,
        scheduleAlways: editing.scheduleType === 'ALWAYS',
        // Message
        messageText: readConfig<string | undefined>(cfg, 'messageText', undefined),
        font: readConfig<string>(cfg, 'font', 'Standard'),
        fontSize: readConfig<number>(cfg, 'fontSize', 28),
        color: readConfig<string>(cfg, 'color', '#FFFFFF'),
        // RSS
        rssUrl: readConfig<string | undefined>(cfg, 'rssUrl', undefined),
        showTitle: readConfig<boolean>(cfg, 'showTitle', true),
        showSummary: readConfig<boolean>(cfg, 'showSummary', false),
        numStories: readConfig<number>(cfg, 'numStories', 5),
        storySeparator: readConfig<string>(cfg, 'storySeparator', '#FFFFFF'),
        // Financial Quotes (Stocks)
        financeSymbols: readConfig<string>(cfg, 'symbols', DEFAULT_STOCK_SYMBOLS),
        stockLayout: readConfig<string>(cfg, 'layout', 'compact'),
        positiveColor: readConfig<string>(cfg, 'positiveColor', POSITIVE_COLOR_DEFAULT),
        negativeColor: readConfig<string>(cfg, 'negativeColor', NEGATIVE_COLOR_DEFAULT),
        stockShowCurrency: readConfig<boolean>(cfg, 'showCurrency', false),
        stockShowExchange: readConfig<boolean>(cfg, 'showExchange', false),
        // Sports Scores
        leagueKey: readConfig<string | undefined>(cfg, 'leagueKey', undefined),
        sportsDate: readConfig<string | undefined>(cfg, 'date', undefined),
        sportsShowBroadcast: readConfig<boolean>(cfg, 'showBroadcast', false),
        sportsShowVenue: readConfig<boolean>(cfg, 'showVenue', false),
        sportsShowOnlyFavorites: readConfig<boolean>(cfg, 'showOnlyFavorites', false),
      })
    } else {
      // 创建模式：根据 defaultType 初始化默认 name + 基础默认值
      setActiveType(defaultType)
      reset({
        name: defaultNameForItemType(defaultType),
        scheduleAlways: true,
        font: 'Standard',
        fontSize: 28,
        color: '#FFFFFF',
        rssUrl: RSS_PRESETS[0]?.url,
        customRssUrl: '',
        showTitle: true,
        showSummary: false,
        numStories: 5,
        storySeparator: '#FFFFFF',
        // Financial Quotes 默认值
        financeSymbols: DEFAULT_STOCK_SYMBOLS,
        stockLayout: 'compact',
        positiveColor: POSITIVE_COLOR_DEFAULT,
        negativeColor: NEGATIVE_COLOR_DEFAULT,
        stockShowCurrency: false,
        stockShowExchange: false,
        // Sports Scores 默认值
        sportsShowBroadcast: false,
        sportsShowVenue: false,
        sportsShowOnlyFavorites: false,
      })
    }
    setTypeError(null)
    // 清空预览
    setStockPreview(null)
    setStockPreviewError(null)
    setSportsPreview(null)
    setSportsPreviewError(null)
  }, [isEdit, editing, defaultType, reset])

  // ============ 创建模式下切换 Tab：更新默认 name + 类型相关默认值 ============
  const handleTabChange = (type: PlaylistItemType) => {
    setActiveType(type)
    setTypeError(null)
    if (!isEdit) {
      // 创建模式：切换 tab 时自动改 name 为对应默认值
      setValue('name', defaultNameForItemType(type), { shouldValidate: false })
      if (type === 'RSS_FEED' && !(watch('rssUrl') ?? '').trim()) {
        setValue('rssUrl', RSS_PRESETS[0]?.url, { shouldValidate: false })
      }
    }
  }

  const comingSoon = COMING_SOON_TYPES.includes(activeType)

  // ============ 提交 ============
  const onSubmit = async (data: FormData) => {
    setTypeError(null)

    // 类型特定运行时校验
    const typeErr = validateForType(activeType, data)
    if (typeErr) {
      setTypeError(typeErr)
      return
    }

    // 组装 config：根据 activeType 选字段
    const config: Record<string, unknown> = {
      font: data.font ?? 'Standard',
      fontSize: data.fontSize ?? 28,
      color: data.color ?? '#FFFFFF',
    }

    if (activeType === 'MESSAGE') {
      config.messageText = (data.messageText ?? '').trim()
      // 兼容老数据：也把文本放到 content 字段
    } else if (activeType === 'RSS_FEED') {
      const rawUrl = (data.rssUrl ?? RSS_PRESETS[0].url).trim()
      config.rssUrl = rawUrl === CUSTOM_URL_SENTINEL
        ? (data.customRssUrl ?? '').trim()
        : rawUrl
      config.customRssUrl = rawUrl === CUSTOM_URL_SENTINEL ? (data.customRssUrl ?? '').trim() : ''
      config.showTitle = data.showTitle ?? true
      config.showSummary = data.showSummary ?? false
      config.numStories = data.numStories ?? 5
      config.storySeparator = data.storySeparator ?? '#FFFFFF'
    } else if (activeType === 'IMAGE') {
      // Image 目前先记录上传状态，上传功能可以后续扩展
      config.mediaKind = 'upload_or_gallery'
    } else if (activeType === 'FINANCIAL_QUOTES') {
      const symbols = (data.financeSymbols ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      config.symbols = symbols.join(',')
      config.layout = data.stockLayout ?? 'compact'
      config.positiveColor = data.positiveColor ?? POSITIVE_COLOR_DEFAULT
      config.negativeColor = data.negativeColor ?? NEGATIVE_COLOR_DEFAULT
      config.showCurrency = data.stockShowCurrency ?? false
      config.showExchange = data.stockShowExchange ?? false
    } else if (activeType === 'SPORTS_SCORES') {
      config.leagueKey = (data.leagueKey ?? '').trim()
      if (data.sportsDate?.trim()) {
        config.date = data.sportsDate.trim()
      }
      config.showBroadcast = data.sportsShowBroadcast ?? false
      config.showVenue = data.sportsShowVenue ?? false
      config.showOnlyFavorites = data.sportsShowOnlyFavorites ?? false
    }

    const payload: Partial<PlaylistItem> & { itemType: PlaylistItem['itemType'] } = {
      itemType: activeType,
      name: data.name.trim(),
      icon: defaultIconForItemType(activeType),
      config,
      scheduleType: data.scheduleAlways ? 'ALWAYS' : 'CUSTOM',
      // MESSAGE 类型也把文本写到 content 字段，方便渲染时兼容
      content: activeType === 'MESSAGE' ? (data.messageText ?? '').trim() : undefined,
    }

    try {
      if (isEdit && editing) {
        await playlistItemsApi.update(playlistId, editing.id, payload)
      } else {
        await playlistItemsApi.create(playlistId, payload)
      }
      onSuccess(`Item "${payload.name}" ${isEdit ? 'updated' : 'added to playlist'}`)
    } catch (err: unknown) {
      const e = err as {
        response?: { data?: { error?: { message?: string; details?: { path?: (string | number)[] | string; message?: string }[] } } }
        message?: string
      }
      const apiErr = e.response?.data?.error
      if (apiErr?.details && Array.isArray(apiErr.details) && apiErr.details.length > 0) {
        // Backend Zod failure: surface the specific field(s) that failed
        const detailStr = apiErr.details
          .map((d) => {
            const p = d.path
            const pathLabel = Array.isArray(p) && p.length ? p.join('.') : typeof p === 'string' && p.length ? p : 'value'
            return `${pathLabel}: ${d.message}`
          })
          .join(' · ')
        setTypeError(`${apiErr.message ?? 'Validation Error'} — ${detailStr}`)
      } else {
        setTypeError(apiErr?.message ?? e.message ?? 'Failed to save playlist item')
      }
    }
  }

  // watch 用于条件渲染和 UI 联动
  const showTitle = watch('showTitle')
  const showSummary = watch('showSummary')
  const watchedFinanceSymbols = watch('financeSymbols')
  const watchedLeagueKey = watch('leagueKey')
  const watchedSportsDate = watch('sportsDate')

  // RSS 预设 label 反查（显示在 select 上），支持 Custom URL
  const currentRssLabel = useMemo(() => {
    const url = watch('rssUrl')
    if (url === CUSTOM_URL_SENTINEL) return 'Custom URL...'
    const match = RSS_PRESETS.find((p) => p.url === url)
    return match?.label ?? url ?? RSS_PRESETS[0].label
  }, [watch('rssUrl')])

  const isCustomRssUrl = useMemo(() => watch('rssUrl') === CUSTOM_URL_SENTINEL, [watch('rssUrl')])
  const watchedRssUrl = watch('rssUrl')
  const watchedCustomRssUrl = watch('customRssUrl')

  // ============ RSS Feed fetch & preview ============
  const handleRssFetch = async () => {
    setRssPreviewLoading(true)
    setRssPreviewError(null)
    setRssPreview(null)
    setRssPublishResult(null)
    try {
      const url = isCustomRssUrl ? (watchedCustomRssUrl ?? '').trim() : (watchedRssUrl ?? '').trim()
      if (!url || url === CUSTOM_URL_SENTINEL) {
        setRssPreviewError('Please select or enter an RSS URL first')
        return
      }
      const numStories = watch('numStories') ?? 5
      const result = await feedsApi.rssFetch(url, numStories)
      setRssPreview(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setRssPreviewError(`Failed to fetch RSS feed: ${msg}`)
    } finally {
      setRssPreviewLoading(false)
    }
  }

  // ============ RSS Feed publish to device ============
  const handleRssPublish = async () => {
    if (!editing) return
    setRssPublishing(true)
    setRssPublishResult(null)
    setRssPreviewError(null)
    try {
      const url = isCustomRssUrl ? (watchedCustomRssUrl ?? '').trim() : (watchedRssUrl ?? '').trim()
      if (!url || url === CUSTOM_URL_SENTINEL) {
        setRssPreviewError('Please select or enter an RSS URL first')
        return
      }
      const cfg = {
        showTitle: watch('showTitle') ?? true,
        showSummary: watch('showSummary') ?? false,
        numStories: watch('numStories') ?? 5,
        font: watch('font') ?? 'Standard',
        fontSize: watch('fontSize') ?? 16,
        color: watch('color') ?? '#FFFFFF',
        storySeparator: watch('storySeparator') ?? '#FFFFFF',
      }
      const result = await feedsApi.rssPublish(editing.id, url, 'text', cfg)
      setRssPublishResult(
        `Published ${result.itemsSent} story(ies) to the device (${result.mode === 'text' ? 'text file write, restarts display' : 'live variable update, no restart'}). Response: ${result.response || 'no response'}`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setRssPreviewError(`Failed to publish RSS: ${msg}`)
    } finally {
      setRssPublishing(false)
    }
  }

  // ============ Message publish to device ============
  const handleMessagePublish = async () => {
    if (!editing) return
    setMsgPublishing(true)
    setMsgPublishResult(null)
    setMsgPublishError(null)
    try {
      const text = (watch('messageText') ?? '').trim()
      if (!text) {
        setMsgPublishError('Please enter message text first')
        return
      }
      const cfg = {
        font: watch('font') ?? 'Standard',
        fontSize: watch('fontSize') ?? 16,
        color: watch('color') ?? '#FFFFFF',
      }
      const result = await feedsApi.messagePublish(editing.id, text, 'text', cfg)
      setMsgPublishResult(
        `Message published (${result.textLength} chars) to the device (${result.mode === 'text' ? 'text file write, restarts display' : 'live variable update, no restart'}). Response: ${result.response || 'no response'}`,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setMsgPublishError(`Failed to publish message: ${msg}`)
    } finally {
      setMsgPublishing(false)
    }
  }

  // 当前选中的体育联赛 label
  const currentSportLabel = useMemo(() => {
    const key = watchedLeagueKey
    const match = sportLeagues.find((l) => l.key === key)
    return match ? `${match.icon} ${match.label}` : (key ? key : 'Select a league...')
  }, [watchedLeagueKey, sportLeagues])

  // ============ 股票预览 ============
  const handleStockPreview = async () => {
    const syms = (watchedFinanceSymbols ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (syms.length === 0) {
      setStockPreviewError('Please enter at least one stock symbol first')
      return
    }
    setStockPreviewLoading(true)
    setStockPreviewError(null)
    setStockPreview(null)
    try {
      const { quotes, errors } = await feedsApi.stockQuotes(syms)
      if (errors && errors.length > 0) {
        setStockPreviewError(errors.map((e) => `${e.symbol}: ${e.message}`).join('; '))
      }
      setStockPreview(quotes)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setStockPreviewError(`Failed to fetch quotes: ${msg}`)
    } finally {
      setStockPreviewLoading(false)
    }
  }

  // 添加一只热门股票到 symbols
  const handleAddStockSymbol = (sym: string) => {
    const current = (watchedFinanceSymbols ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (current.includes(sym.toUpperCase())) return
    current.push(sym.toUpperCase())
    setValue('financeSymbols', current.join(', '), { shouldValidate: false })
  }

  // ============ 体育比分预览 ============
  const handleSportsPreview = async () => {
    const key = (watchedLeagueKey ?? '').trim()
    if (!key) {
      setSportsPreviewError('Please select a sports league first')
      return
    }
    const dateStr = watchedSportsDate?.trim() || undefined
    setSportsPreviewLoading(true)
    setSportsPreviewError(null)
    setSportsPreview(null)
    try {
      const games = await feedsApi.sportsScoreboard(key, dateStr)
      setSportsPreview(games)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setSportsPreviewError(`Failed to fetch scores: ${msg}`)
    } finally {
      setSportsPreviewLoading(false)
    }
  }

  // 体育联赛显示选项的 toggle
  const watchSportsBroadcast = watch('sportsShowBroadcast')
  const watchSportsVenue = watch('sportsShowVenue')
  const watchStockCurrency = watch('stockShowCurrency')
  const watchStockExchange = watch('stockShowExchange')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* ========== 类型 Tabs ========== */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 border-b border-slate-200 pb-5">
        {TABS.map(({ type, label, Icon }) => {
          const active = activeType === type
          return (
            <button
              key={type}
              type="button"
              onClick={() => handleTabChange(type)}
              className={`flex flex-col items-center gap-1.5 p-2 rounded-lg transition ${
                active
                  ? 'text-brand-700'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <span
                className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition ${
                  active
                    ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-400'
                }`}
              >
                <Icon className="w-6 h-6" strokeWidth={1.8} />
              </span>
              <span className="text-[11px] font-medium text-center leading-tight whitespace-pre-line">
                {label}
              </span>
            </button>
          )
        })}
      </div>

      {/* ========== 通用字段：Name ========== */}
      <div>
        <label className="block text-base font-medium text-slate-800 mb-1">Name:</label>
        <input
          type="text"
          {...register('name')}
          className="w-full px-3 py-2 border-b border-slate-300 bg-transparent text-base text-slate-800 focus:outline-none focus:border-brand-500 transition"
        />
        {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
      </div>

      {/* ========== 类型特定校验错误 ========== */}
      {typeError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-sm">
          {typeError}
        </div>
      )}

      {/* ========== Coming Soon Placeholder ========== */}
      {comingSoon && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-6 text-center space-y-2">
          <div className="text-2xl">🚧</div>
          <div className="font-semibold">{TABS.find((t) => t.type === activeType)?.label ?? activeType} — Coming Soon</div>
          <div className="text-sm text-amber-700">
            This playlist item type is under development. Check back shortly for Sports Scores, Financial Quotes, Watchlist, Custom Content, Google Sheets, and Newsroom.
          </div>
        </div>
      )}

      {/* ========== MESSAGE 类型 ========== */}
      {activeType === 'MESSAGE' && !comingSoon && (
        <div className="space-y-5">
          <div>
            <textarea
              {...register('messageText')}
              rows={5}
              placeholder="Write the message here"
              className="w-full px-4 py-5 bg-black text-white font-mono text-base rounded-md border border-black focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-slate-500 resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className="block text-base font-medium text-slate-800 mb-1">Font:</label>
              <div className="relative">
                <select
                  {...register('font')}
                  className="w-full appearance-none px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition pr-8"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-base font-medium text-slate-800 mb-1">Font Size:</label>
              <div className="flex items-center gap-1">
                <div className="relative flex-1">
                  <select
                    {...register('fontSize')}
                    className="w-full appearance-none px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition pr-8"
                  >
                    {FONT_SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <span className="text-base text-slate-600">px</span>
              </div>
            </div>
            <div>
              <label className="block text-base font-medium text-slate-800 mb-1">Color:</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  {...register('color')}
                  className="w-10 h-10 rounded border border-slate-300 cursor-pointer"
                />
                <input
                  type="text"
                  {...register('color')}
                  className="flex-1 px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition font-mono text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== IMAGE 类型 ========== */}
      {activeType === 'IMAGE' && !comingSoon && (
        <div className="space-y-6">
          <div className="text-sm text-slate-600">
            Only .bmp or .png files less than 10MB and build to 16 pixels in height are supported
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            <button
              type="button"
              className="flex-1 min-w-[180px] max-w-xs bg-brand-500 hover:bg-brand-600 text-white font-medium py-3 px-6 rounded-md shadow-sm transition-colors text-center"
              onClick={() => alert('Upload Image: File uploader can be connected here.')}
            >
              Upload Image
            </button>
            <span className="text-slate-500 font-medium">OR</span>
            <button
              type="button"
              className="flex-1 min-w-[180px] max-w-xs bg-brand-500 hover:bg-brand-600 text-white font-medium py-3 px-6 rounded-md shadow-sm transition-colors text-center"
              onClick={() => alert('Gallery: Image picker modal can be shown here.')}
            >
              Gallery
            </button>
          </div>
        </div>
      )}

      {/* ========== RSS FEED 类型 ========== */}
      {activeType === 'RSS_FEED' && !comingSoon && (
        <div className="space-y-5">
          {/* Select RSS URL */}
          <div>
            <label className="block text-base font-medium text-slate-800 mb-1">Select RSS URL:</label>
            <div className="relative">
              <select
                {...register('rssUrl')}
                className="w-full appearance-none px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition pr-8"
              >
                {RSS_PRESETS.map((p) => (
                  <option key={p.url} value={p.url}>{p.label}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <div className="text-xs text-slate-500 mt-1">{currentRssLabel}</div>
          </div>

          {/* Custom URL input (shown when "Custom URL..." is selected) */}
          {isCustomRssUrl && (
            <div>
              <label className="block text-base font-medium text-slate-800 mb-1">Custom RSS Feed URL:</label>
              <input
                {...register('customRssUrl')}
                type="url"
                placeholder="https://example.com/rss.xml"
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          )}

          {/* Fetch Preview button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRssFetch}
              disabled={rssPreviewLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${rssPreviewLoading ? 'animate-spin' : ''}`} />
              {rssPreviewLoading ? 'Fetching...' : 'Fetch Preview'}
            </button>
          </div>

          {/* RSS Fetch Error */}
          {rssPreviewError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {rssPreviewError}
            </div>
          )}

          {/* RSS Fetch Preview List */}
          {rssPreview && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-800 mb-1">
                {rssPreview.feedTitle}
              </div>
              <div className="text-xs text-slate-500 mb-2 truncate">Source: {rssPreview.feedUrl}</div>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {rssPreview.items.map((item: RssItem, i: number) => (
                  <div key={i} className="text-xs border-b border-slate-200 pb-2 last:border-0">
                    <div className="font-medium text-slate-700">{i + 1}. {item.title}</div>
                    {item.summary && (
                      <div className="text-slate-500 line-clamp-2">{item.summary}</div>
                    )}
                    {item.pubDate && (
                      <div className="text-slate-400 mt-0.5">{new Date(item.pubDate).toLocaleString()}</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="text-xs text-slate-500 mt-2">
                {rssPreview.items.length} story(ies) fetched · {rssPreview.items.length} will be sent to device
              </div>
            </div>
          )}

          {/* Show Title / Show Summary toggle switches */}
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-base font-medium text-slate-800">Show Title:</span>
              <button
                type="button"
                onClick={() => setValue('showTitle', !showTitle, { shouldValidate: true })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  showTitle ? 'bg-brand-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    showTitle ? 'translate-x-[26px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-base font-medium text-slate-800">Show Summary:</span>
              <button
                type="button"
                onClick={() => setValue('showSummary', !showSummary, { shouldValidate: true })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  showSummary ? 'bg-brand-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    showSummary ? 'translate-x-[26px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
          </div>

          {/* 其他字段 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className="block text-base font-medium text-slate-800 mb-1">Number of stories:</label>
              <div className="relative">
                <select
                  {...register('numStories')}
                  className="w-full appearance-none px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition pr-8"
                >
                  {STORY_COUNT_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-base font-medium text-slate-800 mb-1">Font:</label>
              <div className="relative">
                <select
                  {...register('font')}
                  className="w-full appearance-none px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition pr-8"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-base font-medium text-slate-800 mb-1">Font Size:</label>
              <div className="flex items-center gap-1">
                <div className="relative flex-1">
                  <select
                    {...register('fontSize')}
                    className="w-full appearance-none px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition pr-8"
                  >
                    {FONT_SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <span className="text-base text-slate-600">px</span>
              </div>
            </div>
            <div>
              <label className="block text-base font-medium text-slate-800 mb-1">Color:</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  {...register('color')}
                  className="w-10 h-10 rounded border border-slate-300 cursor-pointer"
                />
                <input
                  type="text"
                  {...register('color')}
                  className="flex-1 px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition font-mono text-sm"
                />
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-base font-medium text-slate-800 mb-1">Story Separator:</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  {...register('storySeparator')}
                  className="w-10 h-10 rounded border border-slate-300 cursor-pointer"
                />
                <input
                  type="text"
                  {...register('storySeparator')}
                  className="flex-1 px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition font-mono text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== FINANCIAL_QUOTES（股票行情）类型 ========== */}
      {activeType === 'FINANCIAL_QUOTES' && !comingSoon && (
        <div className="space-y-5">
          {/* Symbol 输入 */}
          <div>
            <label className="block text-base font-medium text-slate-800 mb-1">
              Stock Symbols <span className="text-xs text-slate-500">(comma separated, max 50)</span>
            </label>
            <textarea
              {...register('financeSymbols')}
              rows={2}
              placeholder="AAPL, MSFT, GOOGL"
              className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-y"
            />
            <div className="text-xs text-slate-500 mt-1">
              {(watchedFinanceSymbols ?? '').split(',').filter((s) => s.trim()).length} symbol(s) entered
            </div>
          </div>

          {/* 热门股票快速添加 */}
          <div>
            <label className="block text-base font-medium text-slate-800 mb-2">Popular Stocks (click to add):</label>
            {loadingPresets ? (
              <div className="text-sm text-slate-500">Loading presets...</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {popularStocks.slice(0, 16).map((s) => {
                  const alreadyAdded = (watchedFinanceSymbols ?? '')
                    .toUpperCase()
                    .split(',')
                    .map((x) => x.trim())
                    .includes(s.symbol.toUpperCase())
                  return (
                    <button
                      key={s.symbol}
                      type="button"
                      onClick={() => handleAddStockSymbol(s.symbol)}
                      disabled={alreadyAdded}
                      className={`px-3 py-1.5 text-xs rounded-full border transition ${
                        alreadyAdded
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-white border-brand-200 text-brand-700 hover:bg-brand-50 hover:border-brand-400'
                      }`}
                      title={`${s.name} (${s.market})`}
                    >
                      <span className="font-semibold">{s.symbol}</span>
                      <span className="ml-1 text-slate-500">· {s.market}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 显示样式配置 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className="block text-base font-medium text-slate-800 mb-1">Layout:</label>
              <div className="relative">
                <select
                  {...register('stockLayout')}
                  className="w-full appearance-none px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition pr-8"
                >
                  {STOCK_LAYOUT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-base font-medium text-slate-800 mb-1">Font:</label>
              <div className="relative">
                <select
                  {...register('font')}
                  className="w-full appearance-none px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition pr-8"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-base font-medium text-slate-800 mb-1">Positive Color:</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  {...register('positiveColor')}
                  className="w-10 h-10 rounded border border-slate-300 cursor-pointer"
                />
                <input
                  type="text"
                  {...register('positiveColor')}
                  className="flex-1 px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition font-mono text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-base font-medium text-slate-800 mb-1">Negative Color:</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  {...register('negativeColor')}
                  className="w-10 h-10 rounded border border-slate-300 cursor-pointer"
                />
                <input
                  type="text"
                  {...register('negativeColor')}
                  className="flex-1 px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Toggle 显示选项 */}
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-base font-medium text-slate-800">Show Currency:</span>
              <button
                type="button"
                onClick={() => setValue('stockShowCurrency', !watchStockCurrency, { shouldValidate: true })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  watchStockCurrency ? 'bg-brand-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    watchStockCurrency ? 'translate-x-[26px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-base font-medium text-slate-800">Show Exchange:</span>
              <button
                type="button"
                onClick={() => setValue('stockShowExchange', !watchStockExchange, { shouldValidate: true })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  watchStockExchange ? 'bg-brand-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    watchStockExchange ? 'translate-x-[26px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
          </div>

          {/* 预览按钮 + 结果 */}
          <div>
            <button
              type="button"
              onClick={handleStockPreview}
              disabled={stockPreviewLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            >
              {stockPreviewLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Fetching quotes...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Preview Live Quotes
                </>
              )}
            </button>

            {stockPreviewError && (
              <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2 text-sm">
                ⚠️ {stockPreviewError}
              </div>
            )}

            {stockPreview && stockPreview.length > 0 && (
              <div className="mt-3 border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Symbol</th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-right font-medium">Price</th>
                      <th className="px-3 py-2 text-right font-medium">Change</th>
                      <th className="px-3 py-2 text-right font-medium">Chg%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stockPreview.map((q) => {
                      const up = q.change >= 0
                      return (
                        <tr key={q.symbol}>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-900">{q.symbol}</td>
                          <td className="px-3 py-2 text-slate-600 truncate max-w-[200px]">{q.name ?? '—'}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {q.price.toFixed(2)}
                            {watchStockCurrency && q.currency ? <span className="ml-1 text-xs text-slate-400">{q.currency}</span> : null}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono ${up ? 'text-green-600' : 'text-red-600'}`}>
                            {up ? '+' : ''}{q.change.toFixed(2)}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
                            {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="px-3 py-1.5 bg-slate-50 text-xs text-slate-500 border-t border-slate-100">
                  Data fetched {stockPreview[0] ? new Date(stockPreview[0].fetchedAt).toLocaleTimeString() : ''}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== SPORTS_SCORES（体育赛事比分）类型 ========== */}
      {activeType === 'SPORTS_SCORES' && !comingSoon && (
        <div className="space-y-5">
          {/* 联赛选择 */}
          <div>
            <label className="block text-base font-medium text-slate-800 mb-1">Sports League:</label>
            <div className="relative">
              <select
                {...register('leagueKey')}
                className="w-full appearance-none px-3 py-2 border-b border-slate-300 bg-transparent text-base focus:outline-none focus:border-brand-500 transition pr-8"
              >
                <option value="">— Select a league —</option>
                {sportLeagues.length > 0
                  ? sportLeagues.map((l) => (
                      <option key={l.key} value={l.key}>{l.icon} {l.label}</option>
                    ))
                  : loadingPresets
                    ? <option value="" disabled>Loading leagues...</option>
                    : null}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <div className="text-xs text-slate-500 mt-1">{currentSportLabel}</div>
          </div>

          {/* 日期选择（可选） */}
          <div>
            <label className="block text-base font-medium text-slate-800 mb-1">
              Date <span className="text-xs text-slate-500">(optional, YYYYMMDD, empty = today)</span>
            </label>
            <input
              type="text"
              {...register('sportsDate')}
              placeholder="e.g. 20250815"
              maxLength={8}
              className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono"
            />
          </div>

          {/* 显示选项 toggles */}
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-base font-medium text-slate-800">Show Broadcast:</span>
              <button
                type="button"
                onClick={() => setValue('sportsShowBroadcast', !watchSportsBroadcast, { shouldValidate: true })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  watchSportsBroadcast ? 'bg-brand-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    watchSportsBroadcast ? 'translate-x-[26px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-base font-medium text-slate-800">Show Venue:</span>
              <button
                type="button"
                onClick={() => setValue('sportsShowVenue', !watchSportsVenue, { shouldValidate: true })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  watchSportsVenue ? 'bg-brand-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    watchSportsVenue ? 'translate-x-[26px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
          </div>

          {/* 预览按钮 + 结果 */}
          <div>
            <button
              type="button"
              onClick={handleSportsPreview}
              disabled={sportsPreviewLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            >
              {sportsPreviewLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Fetching scores...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Preview Scoreboard
                </>
              )}
            </button>

            {sportsPreviewError && (
              <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2 text-sm">
                ⚠️ {sportsPreviewError}
              </div>
            )}

            {sportsPreview && (
              <div className="mt-3 space-y-2">
                {sportsPreview.length === 0 ? (
                  <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-4 text-center">
                    No games scheduled for this date/league
                  </div>
                ) : (
                  sportsPreview.map((g) => (
                    <div key={g.id} className="border border-slate-200 rounded-md p-3 bg-white">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                          {g.statusText}
                        </div>
                        {watchSportsBroadcast && g.broadcast && (
                          <div className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            📺 {g.broadcast}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {/* 客队 */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-500 w-4 text-center">A</span>
                            <span className="font-semibold text-slate-900">{g.awayTeam.displayName}</span>
                            <span className="text-xs text-slate-500">({g.awayTeam.abbreviation})</span>
                          </div>
                          <span className={`font-mono text-lg font-bold ${g.awayTeam.isWinner ? 'text-brand-700' : 'text-slate-700'}`}>
                            {g.awayTeam.score || '—'}
                          </span>
                        </div>
                        {/* 主队 */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-500 w-4 text-center">H</span>
                            <span className="font-semibold text-slate-900">{g.homeTeam.displayName}</span>
                            <span className="text-xs text-slate-500">({g.homeTeam.abbreviation})</span>
                          </div>
                          <span className={`font-mono text-lg font-bold ${g.homeTeam.isWinner ? 'text-brand-700' : 'text-slate-700'}`}>
                            {g.homeTeam.score || '—'}
                          </span>
                        </div>
                      </div>
                      {watchSportsVenue && g.venue && (
                        <div className="mt-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
                          📍 {g.venue}
                        </div>
                      )}
                      {g.lastPlay && g.status === 'in' && (
                        <div className="mt-2 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                          🔔 {g.lastPlay}
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div className="text-xs text-slate-500 text-center">
                  {sportsPreview.length} game(s) · Data from ESPN
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== Schedule (Always) — 所有类型通用 ========== */}
      <div className="pt-3 border-t border-slate-100">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <span className="font-bold text-slate-800 text-base">Schedule</span>
          <input
            type="checkbox"
            {...register('scheduleAlways')}
            defaultChecked
            className="w-4 h-4 accent-brand-600 rounded"
          />
          <span className="text-base text-slate-700">Always</span>
        </label>
      </div>

      {/* ========== Footer Buttons ========== */}
      <div className="flex justify-center gap-4 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="min-w-[200px] px-6 py-2.5 bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-50 font-medium rounded-full transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || comingSoon}
          className="min-w-[200px] px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Add to Playlist'}
        </button>
      </div>
    </form>
  )
}
