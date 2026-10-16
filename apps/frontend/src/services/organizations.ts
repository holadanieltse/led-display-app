// 业务 API 服务封装
import { api } from './api'
import type {
  Organization,
  Display,
  User,
  Playlist,
  PlaylistItem,
  StockQuote,
  PopularStock,
  SportLeague,
  SportsGame,
  DeviceCommand,
  DeviceCommandResult,
  DeviceStatus,
  RssPreset,
  RssFetchResult,
  RssMcsConfig,
} from '../types'

type ApiList<T> = { success: true; data: T[] }
type ApiOne<T> = { success: true; data: T }

// ============ Organizations ============
export const organizationsApi = {
  list: () => api.get<ApiList<Organization>>('/organizations').then((r) => r.data.data),
  get: (id: string) => api.get<ApiOne<Organization>>(`/organizations/${id}`).then((r) => r.data.data),
  create: (data: { name: string; primaryContactName?: string; primaryContactEmail?: string }) =>
    api.post<ApiOne<Organization>>('/organizations', data).then((r) => r.data.data),
  update: (id: string, data: Partial<{ name: string; primaryContactName?: string; primaryContactEmail?: string }>) =>
    api.put<ApiOne<Organization>>(`/organizations/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => api.delete<{ success: true; data: { id: string } }>(`/organizations/${id}`).then((r) => r.data.data),
}

// ============ Displays ============
export const displaysApi = {
  list: (orgId?: string) =>
    api.get<ApiList<Display>>('/displays', { params: orgId ? { orgId } : {} }).then((r) => r.data.data),
  get: (id: string) => api.get<ApiOne<Display>>(`/displays/${id}`).then((r) => r.data.data),
  create: (data: Partial<Display> & { name: string; macAddress: string; orgId: string }) =>
    api.post<ApiOne<Display>>('/displays', data).then((r) => r.data.data),
  update: (id: string, data: Partial<Display>) =>
    api.put<ApiOne<Display>>(`/displays/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => api.delete<{ success: true; data: { id: string } }>(`/displays/${id}`).then((r) => r.data.data),
}

// ============ Users ============
export const usersApi = {
  list: () => api.get<ApiList<User>>('/users').then((r) => r.data.data),
  get: (id: string) => api.get<ApiOne<User>>(`/users/${id}`).then((r) => r.data.data),
  create: (data: { email: string; password: string; name?: string; role?: string; orgId?: string }) =>
    api.post<ApiOne<User>>('/users', data).then((r) => r.data.data),
  update: (id: string, data: Partial<{ email: string; password: string; name?: string; role?: string }>) =>
    api.put<ApiOne<User>>(`/users/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => api.delete<{ success: true; data: { id: string } }>(`/users/${id}`).then((r) => r.data.data),
}

// ============ Playlists ============
export const playlistsApi = {
  listByDisplay: (displayId: string) =>
    api.get<ApiList<Playlist>>(`/displays/${displayId}/playlists`).then((r) => r.data.data),
  get: (id: string) => api.get<ApiOne<Playlist>>(`/playlists/${id}`).then((r) => r.data.data),
  create: (displayId: string, data: { name?: string }) =>
    api.post<ApiOne<Playlist>>(`/displays/${displayId}/playlists`, data).then((r) => r.data.data),
  update: (id: string, data: Partial<{ name: string; isPublished: boolean }>) =>
    api.put<ApiOne<Playlist>>(`/playlists/${id}`, data).then((r) => r.data.data),
  remove: (id: string) =>
    api.delete<{ success: true; data: { id: string } }>(`/playlists/${id}`).then((r) => r.data.data),
  publish: (id: string) =>
    api.post<ApiOne<Playlist>>(`/playlists/${id}/publish`).then((r) => r.data.data),
}

// ============ Playlist Items ============
export const playlistItemsApi = {
  list: (playlistId: string) =>
    api.get<ApiList<PlaylistItem>>(`/playlists/${playlistId}/items`).then((r) => r.data.data),
  create: (playlistId: string, data: Partial<PlaylistItem> & { itemType: PlaylistItem['itemType'] }) =>
    api.post<ApiOne<PlaylistItem>>(`/playlists/${playlistId}/items`, data).then((r) => r.data.data),
  update: (playlistId: string, itemId: string, data: Partial<PlaylistItem>) =>
    api.put<ApiOne<PlaylistItem>>(`/playlists/${playlistId}/items/${itemId}`, data).then((r) => r.data.data),
  remove: (playlistId: string, itemId: string) =>
    api.delete<{ success: true; data: { id: string } }>(`/playlists/${playlistId}/items/${itemId}`).then((r) => r.data.data),
  duplicate: (playlistId: string, itemId: string) =>
    api.post<ApiOne<PlaylistItem>>(`/playlists/${playlistId}/items/${itemId}/duplicate`).then((r) => r.data.data),
  reorder: (playlistId: string, items: { id: string; order: number }[]) =>
    api.put<{ success: true; data: { reordered: number } }>(`/playlists/${playlistId}/items/reorder`, { items }).then((r) => r.data),
}

// ============ Feeds: 股票行情 + 体育比分 ============
export const feedsApi = {
  // 股票
  popularStocks: () =>
    api.get<ApiList<PopularStock>>('/feeds/stocks/popular').then((r) => r.data.data),
  stockQuotes: (symbols: string[]) =>
    api
      .get<ApiOne<{ quotes: StockQuote[]; errors: Array<{ symbol: string; message: string }> }>>('/feeds/stocks/quotes', {
        params: { symbols: symbols.join(',') },
      })
      .then((r) => r.data.data),

  // 体育
  sportLeagues: () =>
    api.get<ApiList<SportLeague>>('/feeds/sports/leagues').then((r) => r.data.data),
  sportsScoreboard: (leagueKey: string, yyyymmdd?: string) =>
    api
      .get<ApiList<SportsGame>>('/feeds/sports/scoreboard', {
        params: { league: leagueKey, ...(yyyymmdd ? { date: yyyymmdd } : {}) },
      })
      .then((r) => r.data.data),

  // RSS Feed
  rssPresets: () =>
    api.get<ApiList<RssPreset>>('/feeds/rss/presets').then((r) => r.data.data),
  rssFetch: (url: string, limit: number = 10) =>
    api
      .get<ApiOne<RssFetchResult>>('/feeds/rss/fetch', { params: { url, limit } })
      .then((r) => r.data.data),
  rssPublish: (displayId: string, url: string, mode: 'text' | 'variable', config?: RssMcsConfig) =>
    api
      .post<ApiOne<{ displayId: string; itemsSent: number; mode: string; packetPreview: string; response: string; ip: string | null }>>(
        `/displays/${displayId}/rss-publish`,
        { url, mode, config },
      )
      .then((r) => r.data.data),

  // Message publish — encode plain text into MCS and send to device
  messagePublish: (
    displayId: string,
    text: string,
    mode: 'text' | 'variable',
    config?: { font: string; fontSize: number; color: string },
  ) =>
    api
      .post<ApiOne<{ displayId: string; mode: string; textLength: number; packetPreview: string; response: string; ip: string | null }>>(
        `/displays/${displayId}/message-publish`,
        { text, mode, config },
      )
      .then((r) => r.data.data),
}

// ============ Device Control (MCS protocol via TCP) ============
export const devicesApi = {
  // Send an MCS command to a display device (Power On/Off, Restart, Clear Memory, Sync Time, Heartbeat)
  sendCommand: (displayId: string, command: DeviceCommand) =>
    api
      .post<ApiOne<DeviceCommandResult>>(`/displays/${displayId}/device/${command}`)
      .then((r) => r.data.data),
  // Send a raw custom MCS packet to a display device and receive serial port response
  sendRawCommand: (displayId: string, command: string) =>
    api
      .post<ApiOne<{ displayId: string; macAddress: string; commandSent: string; packetSent: string; response: string }>>(
        `/displays/${displayId}/device/raw`,
        { command },
      )
      .then((r) => r.data.data),
  // Resolve device IP from MAC via ARP table and check reachability
  getStatus: (displayId: string) =>
    api
      .get<ApiOne<DeviceStatus>>(`/displays/${displayId}/device/status`)
      .then((r) => r.data.data),
}

