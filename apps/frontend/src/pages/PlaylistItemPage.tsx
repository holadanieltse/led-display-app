import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Newspaper,
  Radio,
  Star,
  Table,
  Trophy,
  XCircle,
  Loader2,
} from 'lucide-react'
import { Toast, type ToastType } from '../components/ui/Toast'
import { PlaylistItemForm } from '../components/forms/PlaylistItemForm'
import { displaysApi, playlistsApi, playlistItemsApi } from '../services/organizations'
import type { Display, Playlist, PlaylistItem, PlaylistItemType } from '../types'

type Stats = {
  total: number
  byType: Record<string, number>
  published: boolean
  publishedAt: string | null
  lastUpdatedAt: string | null
  lastUpdatedBy: string | null
}

function computeStats(playlist: Playlist | null): Stats {
  const items = playlist?.items ?? []
  const byType: Record<string, number> = {}
  items.forEach((it) => {
    byType[it.itemType] = (byType[it.itemType] ?? 0) + 1
  })
  return {
    total: items.length,
    byType,
    published: !!playlist?.isPublished,
    publishedAt: playlist?.publishedAt ?? null,
    lastUpdatedAt: playlist?.lastUpdatedAt ?? null,
    lastUpdatedBy: playlist?.lastUpdatedBy ?? null,
  }
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  MESSAGE: MessageCircle,
  IMAGE: ImageIcon,
  RSS_FEED: Radio,
  FINANCIAL_QUOTES: BarChart3,
  SPORTS_SCORES: Trophy,
  WATCHLIST: Star,
  CUSTOM_CONTENT: FileText,
  GOOGLE_SHEETS: Table,
  NEWSROOM: Newspaper,
  RSS: Radio,
  CUSTOM_TEXT: FileText,
  HTML: FileText,
  VIDEO: ImageIcon,
}

const TYPE_COLOR: Record<string, string> = {
  MESSAGE: 'bg-brand-50 text-brand-700 border-brand-200',
  IMAGE: 'bg-brand-50 text-brand-700 border-brand-200',
  RSS_FEED: 'bg-violet-50 text-violet-700 border-violet-200',
  FINANCIAL_QUOTES: 'bg-amber-50 text-amber-700 border-amber-200',
  SPORTS_SCORES: 'bg-rose-50 text-rose-700 border-rose-200',
  WATCHLIST: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  CUSTOM_CONTENT: 'bg-slate-50 text-slate-700 border-slate-200',
  GOOGLE_SHEETS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  NEWSROOM: 'bg-orange-50 text-orange-700 border-orange-200',
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function PlaylistItemPage() {
  const { displayId, itemId } = useParams<{ displayId: string; itemId?: string }>()
  const navigate = useNavigate()

  const [display, setDisplay] = useState<Display | null>(null)
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [items, setItems] = useState<PlaylistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editingItem, setEditingItem] = useState<PlaylistItem | null>(null)
  const [defaultType, setDefaultType] = useState<PlaylistItemType>('MESSAGE')

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const showToast = (message: string, type: ToastType = 'success') => setToast({ message, type })

  const isEditMode = !!itemId

  const loadAll = async () => {
    if (!displayId) return
    setLoading(true)
    setError('')
    try {
      const d = await displaysApi.get(displayId)
      setDisplay(d)

      let playlists = await playlistsApi.listByDisplay(displayId)
      if (playlists.length === 0) {
        const created = await playlistsApi.create(displayId, { name: 'Default Playlist' })
        playlists = [created]
      }
      const pl = playlists[0]
      const full = await playlistsApi.get(pl.id)
      setPlaylist(full)
      setItems(full.items ?? [])

      if (itemId) {
        const match = (full.items ?? []).find((i) => i.id === itemId)
        if (!match) {
          setError(`Playlist item not found (id: ${itemId})`)
        } else {
          setEditingItem(match)
          setDefaultType(match.itemType)
        }
      } else {
        setEditingItem(null)
        setDefaultType('MESSAGE')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } }
      setError(e.response?.data?.error?.message ?? 'Failed to load display')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [displayId, itemId])

  const reloadItems = async () => {
    if (!playlist) return
    try {
      const full = await playlistsApi.get(playlist.id)
      setPlaylist(full)
      setItems(full.items ?? [])
    } catch {
      // ignore
    }
  }

  const stats = useMemo(() => computeStats(playlist), [playlist])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-gray-500">
        <div className="animate-pulse flex gap-3 items-center">
          <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
          Loading playlist...
        </div>
      </div>
    )
  }

  if (error || !display || !playlist) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 flex gap-3 items-start">
          <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-1">Failed to load playlist</div>
            <div className="text-sm">{error || 'Display not found'}</div>
          </div>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 px-4 py-2 text-sm bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition"
        >
          ← Go Back
        </button>
      </div>
    )
  }

  if (isEditMode && !editingItem) {
    return <Navigate to={`/displays/${displayId}`} replace />
  }

  const pageTitle = `${display.name} · ${display.tickerHeight ? `${display.tickerHeight} Pixel` : ''}`

  return (
    <div className="h-screen flex flex-col bg-[#eaf2f8]">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap bg-white px-4 md:px-6 py-4 border-b border-slate-200 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-slate-600 hover:text-brand-700 hover:bg-brand-50 rounded transition"
          title="Back to display"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-[180px]">
          <div className="text-xs text-slate-400 uppercase tracking-wider">Playlist Item</div>
          <h1 className="text-xl font-semibold text-brand-700">{pageTitle}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-brand-50 border border-brand-200 px-3 py-1.5 rounded text-sm text-brand-700 font-medium">
            {isEditMode ? 'Edit Playlist Item' : 'Add New Playlist Item'}
          </div>
        </div>
      </div>

      {/* Main: left stats + right form */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left column: stats & meta — hidden on mobile, sidebar on desktop */}
        <aside className="hidden lg:block w-80 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Playlist overview card */}
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="bg-brand-600 text-white px-4 py-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                <span className="text-sm font-semibold uppercase tracking-wider">Playlist Overview</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 uppercase font-medium">Display</span>
                  <span className="text-sm font-medium text-slate-900 truncate max-w-[180px]">
                    {display.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 uppercase font-medium">Playlist</span>
                  <span className="text-sm font-medium text-slate-900 truncate max-w-[180px]">
                    {playlist.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 uppercase font-medium">Status</span>
                  <span
                    className={`inline-flex items-center gap-1 text-sm font-medium ${
                      stats.published ? 'text-brand-700' : 'text-slate-600'
                    }`}
                  >
                    {stats.published ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Clock className="w-4 h-4" />
                    )}
                    {stats.published ? 'Published' : 'Draft'}
                  </span>
                </div>
              </div>
            </div>

            {/* Summary stats */}
            <div className="rounded-lg border border-slate-200">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-brand-600" />
                  Item Statistics
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Total Items</span>
                  <span className="text-2xl font-bold text-brand-600 tabular-nums">{stats.total}</span>
                </div>
                <div className="h-px bg-slate-100" />
                {stats.total === 0 ? (
                  <div className="text-xs text-slate-400 italic py-2">
                    No items yet. Add your first item using the form on the right.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(stats.byType)
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, count]) => {
                        const Icon = TYPE_ICON[type] ?? FileText
                        const colorCls = TYPE_COLOR[type] ?? 'bg-slate-50 text-slate-700 border-slate-200'
                        return (
                          <div
                            key={type}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex w-7 h-7 items-center justify-center rounded-md border ${colorCls}`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </span>
                              <span className="text-slate-700">{type.replace(/_/g, ' ')}</span>
                            </div>
                            <span className="font-semibold text-slate-900 tabular-nums">
                              {count}
                            </span>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="rounded-lg border border-slate-200">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-brand-600" />
                  Timeline
                </div>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500 uppercase font-medium mb-0.5">
                    Last Updated
                  </div>
                  <div className="text-slate-800 font-medium">
                    {formatDateTime(stats.lastUpdatedAt)}
                  </div>
                  {stats.lastUpdatedBy && (
                    <div className="text-xs text-slate-500 mt-0.5">by {stats.lastUpdatedBy}</div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-medium mb-0.5">
                    Published At
                  </div>
                  <div className="text-slate-800 font-medium">
                    {formatDateTime(stats.publishedAt)}
                  </div>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
              <div className="font-semibold mb-1">💡 Tips</div>
              <ul className="list-disc list-inside space-y-1 text-brand-800 text-xs leading-relaxed">
                <li>Switch tabs to add different item types.</li>
                <li>Stock & Sports previews use mock data for now.</li>
                <li>Save and then publish to push changes to the display.</li>
              </ul>
            </div>
          </div>
        </aside>

        {/* Right column: form */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 md:p-8">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  {isEditMode ? 'Edit Playlist Item' : 'Add a Playlist Item'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Configure the content type and display options below.
                </p>
              </div>
              <div className="p-6">
                <PlaylistItemForm
                  playlistId={playlist.id}
                  editing={editingItem}
                  defaultType={defaultType}
                  onClose={() => navigate(-1)}
                  onSuccess={(msg) => {
                    navigate(`/displays/${displayId}`, { state: { flashMessage: msg } })
                  }}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
