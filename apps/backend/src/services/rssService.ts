// =============================================================================
// RSS Feed Service — Fetch, Parse & Encode for LED Ticker Display
// =============================================================================
//
// WHAT THIS FILE DOES:
//   Takes RSS feed URLs → fetches & parses them → encodes the headlines into
//   MCS protocol format → returns a ready-to-send packet string.
//
//   This is the "content pipeline" between the internet (RSS feeds) and the
//   physical LED ticker hardware (which only understands MCS protocol).
//
// THE DATA FLOW:
//
//   RSS Feed URL
//       │
//       ▼
//   fetchRssFeed()        ← Uses rss-parser library to download & parse XML
//       │                    Returns: { feedTitle, items: [{ title, summary, ... }] }
//       ▼
//   buildRssMcsContent()  ← Converts text into MCS control-code string
//       │                    Adds scroll effects, font, color, separators
//       │                    e.g. "^E$SCL1$^F$SS16$^O$F:#FFFFFF$Breaking News..."
//       ▼
//   buildRssTextPacket()  ← Wraps content in the doc's write flow (§9/§10):
//       text mode:     ^B01^ACSMAT{size}^D{chk}^AAA{content}^D{chk}^C  (restarts)
//       variable mode: ^B01^ACSM$F00$V{size}^D{chk}^ACB$F00${content}^D{chk}^C
//       ▼
//   sendPacketToMac()     ← (in deviceServer.ts) writes packet to TCP socket
//
// MCS CONTENT CONTROL CODES USED HERE:
//   ^E$SCL1$     = Scroll Left effect, speed 1
//   ^F$SS16$     = Set Font Size to SS16 (16-pixel tall font)
//   ^O$F:#FFF$   = Set foreground color (hex RGB)
//   ^L           = New page / line break (separates stories)
//
// TEXT vs VARIABLE MODE:
//   text     — writes text file label "A". Becomes the displayed content and
//              causes a full restart. Use for deployment.
//   variable — writes variable "$F00$" with no restart. The active playlist must
//              reference it (`^N$F00$`) for it to be visible. Use for live updates.
//   (The old PM / AA commands are NOT part of MCS v3.1 — see the v2 reference.)
//
// WHERE TO LOOK NEXT:
//   - mcsService.ts — the system command builders (Power On/Off, etc.)
//   - feed.routes.ts — the REST endpoints that call these functions
//   - PlaylistItemForm.tsx — the frontend UI where users configure RSS feeds
// =============================================================================

import Parser from 'rss-parser'
import { buildTextWritePacket, buildVariableWritePacket } from './mcsService'

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: false }],
    ],
  },
})

// ==================== Preset RSS Map ====================

export const RSS_PRESETS: { label: string; url: string }[] = [
  { label: 'CNBC - Headlines',       url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { label: 'Fox News - Headlines',    url: 'https://moxie.foxnews.com/google-publisher/latest.xml' },
  { label: 'NPR - Headlines',        url: 'https://feeds.npr.org/1001/rss.xml' },
  { label: 'CNBC - Business News',   url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147' },
  { label: 'NY Times - US News',     url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
  { label: 'Politico - Politics',    url: 'https://www.politico.com/rss/politicopicks.xml' },
  { label: 'BBC - World News',       url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
  { label: 'ESPN - Top Headlines',   url: 'https://www.espn.com/espn/rss/news' },
  { label: 'ESPN - NFL',             url: 'https://www.espn.com/espn/rss/nfl/news' },
  { label: 'ESPN - MLB',             url: 'https://www.espn.com/espn/rss/mlb/news' },
  { label: 'ESPN - NBA',             url: 'https://www.espn.com/espn/rss/nba/news' },
  { label: 'Yahoo Finance',          url: 'https://finance.yahoo.com/news/rssindex' },
  { label: 'Reuters - Business',     url: 'https://feeds.reuters.com/reuters/businessNews' },
  { label: 'CNN - Top Stories',      url: 'http://rss.cnn.com/rss/edition.rss' },
  { label: 'The Guardian - US',      url: 'https://www.theguardian.com/us-news/rss' },
  { label: 'Wall Street Journal',    url: 'https://feeds.content.dowjones.com/public/rss/RSSWorldNews.xml' },
]

// Sentinel value for custom URL selection in the dropdown
export const CUSTOM_URL_SENTINEL = '__custom__'

export const RSS_PRESETS_WITH_CUSTOM = [
  ...RSS_PRESETS,
  { label: 'Custom URL...', url: CUSTOM_URL_SENTINEL },
]

// ==================== Types ====================

export interface RssItem {
  title: string
  summary: string
  link: string
  pubDate: string
}

export interface RssFetchResult {
  feedTitle: string
  feedUrl: string
  items: RssItem[]
}

export interface RssMcsConfig {
  showTitle: boolean
  showSummary: boolean
  numStories: number
  font: string // 'Standard' | 'Bold' | 'Condensed' | 'Serif'
  fontSize: number // pixel size
  color: string // hex like '#FFFFFF'
  storySeparator: string // hex like '#FFFFFF'
}

// ==================== Feed Fetching ====================

/**
 * Fetch and parse an RSS feed, returning structured items.
 * Follows redirects automatically via the rss-parser library.
 */
export async function fetchRssFeed(
  url: string,
  maxItems: number = 20,
): Promise<RssFetchResult> {
  try {
    const feed = await parser.parseURL(url)
    const items = feed.items.slice(0, maxItems).map((raw) => {
      const title = (raw.title ?? '').trim()
      // Strip HTML tags from summary/description
      const rawSummary = raw.summary ?? (raw as { description?: string }).description ?? ''
      const summary = rawSummary.replace(/<[^>]*>/g, '').trim()
      return {
        title: title || 'Untitled',
        summary: summary || '(no summary)',
        link: raw.link ?? '',
        pubDate: raw.pubDate ?? new Date().toISOString(),
      }
    })

    return {
      feedTitle: feed.title ?? 'RSS Feed',
      feedUrl: url,
      items,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to fetch RSS feed: ${msg}`)
  }
}

// ==================== MCS Content Encoding ====================

/**
 * Map font name to MCS SS code.
 * Standard → SS7, Bold → SS8, Condensed → SS16, Serif → SS32 etc.
 * We map by the font size since MCS fonts are size-based.
 */
function fontToSsCode(fontSize: number, font: string): string {
  // Available MCS fonts: SS7, SS8, SS16, SS32, SS64
  // Pick the closest size
  const sizes = [7, 8, 16, 32, 64]
  const closest = sizes.reduce((prev, curr) =>
    Math.abs(curr - fontSize) < Math.abs(prev - fontSize) ? curr : prev,
  )
  return `SS${closest}`
}

/**
 * Convert hex color (#FFFFFF) to MCS color code (^O$F:#FFFFFF$).
 */
function mcsColor(hex: string): string {
  return `^O$F:${hex}$`
}

/**
 * Truncate text to a max character length for the LED display.
 * LED tickers have limited character width per line.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + '…'
}

/**
 * Build the MCS protocol content string for an RSS feed.
 *
 * This is where plain text becomes LED ticker content. The MCS protocol uses
 * inline control codes (starting with ^) to switch fonts, colors, and effects.
 * Think of it like HTML, but for a 16-pixel-tall scrolling LED strip.
 *
 * EXAMPLE OUTPUT:
 *   ^E$SCL1$^F$SS16$^O$F:#FFFFFF$Breaking News^L^O$F:#FFFFFF$─^L^F$SS16$^O$F:#FFFFFF$Next Story...
 *   │        │         │            │      │         │            │
 *   │        │         │            │      │         │            └─ Story text
 *   │        │         │            │      │         └─ Restore color for separator
 *   │        │         │            │      └─ Separator character between stories
 *   │        │         │            └─ New page (visually separates stories)
 *   │        │         └─ Set foreground color to white
 *   │        └─ Set font to SS16 (16px tall — matches typical ticker height)
 *   └─ Scroll Left effect at speed 1
 *
 * @returns The MCS content string (ready to be wrapped in PM or AA command)
 */
export function buildRssMcsContent(
  items: RssItem[],
  config: RssMcsConfig,
): string {
  if (items.length === 0) {
    return 'No stories available'
  }

  const ssCode = fontToSsCode(config.fontSize, config.font)
  const colorCode = mcsColor(config.color)
  const sepColorCode = mcsColor(config.storySeparator)

  const parts: string[] = []

  // Scroll effect + speed
  parts.push(`^E$SCL1$`)

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    if (config.showTitle) {
      parts.push(`^F$${ssCode}$${colorCode}`)
      parts.push(truncate(item.title, 80))
    }

    if (config.showSummary && item.summary && item.summary !== '(no summary)') {
      if (config.showTitle) parts.push(' ')
      parts.push(`^F$${ssCode}$${colorCode}`)
      parts.push(truncate(item.summary, 120))
    }

    // Separator between stories (but not after the last one)
    if (i < items.length - 1) {
      parts.push(`^L`)
      // Story separator as a visual break
      parts.push(`${sepColorCode}─`)
      parts.push(`^L`)
    }
  }

  return parts.join('')
}

/**
 * Build the full MCS packet for an RSS feed as a text-file write.
 * The content becomes the device's displayed playlist and triggers a restart
 * (doc §9/§10 "Complete Finance Publish Flow").
 *
 * Pattern: ^B{addr}^ACSMAT{hex_size}^D{chk}^AAA{content}^D{chk}^C
 */
export function buildRssTextPacket(
  items: RssItem[],
  config: RssMcsConfig,
  address: string = '01',
): string {
  const content = buildRssMcsContent(items, config)
  return buildTextWritePacket('A', content, address)
}

/**
 * Build the full MCS packet for an RSS feed as a variable-file write (no
 * restart). The variable must be referenced by the active playlist (`^N$F00$`)
 * to be visible — useful for live updates without restarting the display.
 *
 * Pattern: ^B{addr}^ACSM{lbl}V{hex_size}^D{chk}^ACB{lbl}{content}^D{chk}^C
 */
export function buildRssVariablePacket(
  items: RssItem[],
  config: RssMcsConfig,
  label: string = '$F00$',
  address: string = '01',
): string {
  const content = buildRssMcsContent(items, config)
  return buildVariableWritePacket(label, content, address)
}
