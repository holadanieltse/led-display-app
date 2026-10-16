import { Fragment, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Pencil, Settings, Plus, Copy, Trash2, CheckSquare, Square, AlertCircle, ChevronUp, ChevronDown } from 'lucide-react'
import { Modal } from '../components/ui/Modal'
import { Toast, type ToastType } from '../components/ui/Toast'
import { displaysApi, playlistsApi, playlistItemsApi } from '../services/organizations'
import type { Display, Playlist, PlaylistItem, PlaylistItemType } from '../types'

// PlaylistItem 类型对应的图标标识（用于 DisplayDetailPage 列表显示）
const ITEM_TYPE_META: Record<PlaylistItemType, { label: string; icon: string }> = {
  RSS: { label: 'RSS Feed', icon: '📶' },
  CUSTOM_TEXT: { label: 'Text', icon: '💬' },
  HTML: { label: 'HTML', icon: '🌐' },
  IMAGE: { label: 'Image', icon: '🖼️' },
  VIDEO: { label: 'Video', icon: '🎥' },
  MESSAGE: { label: 'Message', icon: '💬' },
  RSS_FEED: { label: 'RSS Feed', icon: '📶' },
  FINANCIAL_QUOTES: { label: 'Financial Quotes', icon: '📈' },
  SPORTS_SCORES: { label: 'Sports Scores', icon: '⚾' },
  WATCHLIST: { label: 'Watchlist', icon: '⭐' },
  CUSTOM_CONTENT: { label: 'Custom Content', icon: '📝' },
  GOOGLE_SHEETS: { label: 'Google Sheets', icon: '📊' },
  NEWSROOM: { label: 'Newsroom', icon: '📰' },
}

function formatDateTime(iso: string | null): string {
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

// 根据 PlaylistItemType 获取默认图标（用于新建时自动填入 icon 字段）
export function defaultIconForItemType(type: PlaylistItemType): string {
  return ITEM_TYPE_META[type]?.icon ?? '📋'
}
export function defaultNameForItemType(type: PlaylistItemType): string {
  const base = ITEM_TYPE_META[type]?.label ?? 'Item'
  const stamp = Math.floor(Date.now() / 1000).toString().slice(-4)
  return `${base} ${stamp}`
}

export default function DisplayDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const prevPathRef = useRef(location.pathname)
  const initializedRef = useRef(false)

  const [display, setDisplay] = useState<Display | null>(null)
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [items, setItems] = useState<PlaylistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'item'; id: string; name: string } | null>(null)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const showToast = (message: string, type: ToastType = 'success') => setToast({ message, type })

  // 顶部选中 item
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const allSelected = items.length > 0 && items.every((i) => selected[i.id])
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected({})
    } else {
      const next: Record<string, boolean> = {}
      items.forEach((i) => (next[i.id] = true))
      setSelected(next)
    }
  }

  // ========== 数据加载 ==========
  const loadAll = async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const d = await displaysApi.get(id)
      setDisplay(d)

      // 1. 获取 Display 的 Playlist 列表
      let playlists = await playlistsApi.listByDisplay(id)
      // 2. 如果没有 Playlist，自动创建默认 Playlist
      if (playlists.length === 0) {
        const created = await playlistsApi.create(id, { name: 'Default Playlist' })
        playlists = [created]
      }
      const pl = playlists[0]
      // 3. 加载该 Playlist 的 items
      const fullPlaylist = await playlistsApi.get(pl.id)
      setPlaylist(fullPlaylist)
      setItems(fullPlaylist.items ?? [])
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } }
      setError(e.response?.data?.error?.message ?? 'Failed to load display')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Reload on first mount, when id changes, or when navigating back from playlist-item page
    const pathChanged = prevPathRef.current !== location.pathname
    prevPathRef.current = location.pathname

    if (!initializedRef.current || (id && pathChanged)) {
      initializedRef.current = true
      // Check for flash message from navigation state (e.g. "Item added to playlist")
      const state = location.state as { flashMessage?: string } | null
      if (state?.flashMessage) {
        showToast(state.flashMessage, 'success')
        window.history.replaceState({}, '')
      }
      void loadAll()
    }
  }, [id, location.pathname])

  // 重新加载 Playlist items（新增/编辑/删除 item 后调用）
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

  // ========== PlaylistItem 操作 ==========
  const handleAddItem = () => {
    navigate(`/displays/${id}/playlist-item`)
  }

  const handleEditItem = (item: PlaylistItem) => {
    navigate(`/displays/${id}/playlist-item/${item.id}`)
  }

  const handleDuplicateItem = async (item: PlaylistItem) => {
    if (!playlist) return
    try {
      await playlistItemsApi.duplicate(playlist.id, item.id)
      await reloadItems()
      showToast(`Item "${item.name}" duplicated`, 'success')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } }
      showToast(e.response?.data?.error?.message ?? 'Duplicate failed', 'error')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !playlist) return
    try {
      await playlistItemsApi.remove(playlist.id, deleteTarget.id)
      setSelected((s) => {
        const next = { ...s }
        delete next[deleteTarget.id]
        return next
      })
      await reloadItems()
      showToast(`Item "${deleteTarget.name}" deleted`, 'success')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } }
      showToast(e.response?.data?.error?.message ?? 'Delete failed', 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handlePublish = async () => {
    if (!playlist) return
    try {
      await playlistsApi.publish(playlist.id)
      await reloadItems()
      showToast('Playlist published successfully', 'success')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } }
      showToast(e.response?.data?.error?.message ?? 'Publish failed', 'error')
    }
  }

  // ========== Reorder items ==========
  const handleMoveItem = async (index: number, direction: 'up' | 'down') => {
    if (!playlist) return
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= items.length) return

    // Swap items in local state for instant feedback
    const swapped = [...items]
    const tmp = swapped[index]
    if (!tmp) return
    swapped[index] = swapped[newIndex]!
    swapped[newIndex] = tmp
    setItems(swapped)

    // Send new order to backend
    try {
      await playlistItemsApi.reorder(
        playlist.id,
        swapped.map((it, i) => ({ id: it.id, order: i })),
      )
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } }
      showToast(e.response?.data?.error?.message ?? 'Reorder failed', 'error')
      // Revert on error
      await reloadItems()
    }
  }

  // ========== 渲染 ==========
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-gray-500">
        <div className="animate-pulse flex gap-3 items-center">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          Loading display...
        </div>
      </div>
    )
  }
  if (error || !display || !playlist) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 flex gap-3 items-start">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-1">Failed to load display</div>
            <div className="text-sm">{error || 'Display not found'}</div>
          </div>
        </div>
      </div>
    )
  }

  const pageTitle = (() => {
    const parts = [display.name]
    if (display.tickerHeight) parts.push(`${display.tickerHeight} Pixel`)
    return parts.join(' · ')
  })()

  const canPublish = items.length > 0

  return (
    <div>
      {/* 顶部栏：返回、标题、编辑、设置、MAC、Ticker Height、Power Save */}
      <div className="flex items-center gap-3 flex-wrap bg-slate-100 px-4 md:px-5 py-4 rounded-t-md border-b border-slate-200">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition"
          title="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold text-brand-700 flex-1 min-w-[180px]">{pageTitle}</h1>

        <button
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-white rounded transition"
          title="Edit display"
        >
          <Pencil className="w-5 h-5" />
        </button>
        <button
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-white rounded transition"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-white border border-slate-200 px-3 py-1.5 rounded text-sm text-slate-600">
            MAC address:&nbsp;<span className="font-mono">{display.macAddress}</span>
          </div>
          {display.tickerHeight !== null && (
            <div className="bg-white border border-slate-200 px-3 py-1.5 rounded text-sm text-slate-600">
              Ticker Height:&nbsp;<span className="font-medium">{display.tickerHeight}</span>
            </div>
          )}
          <label className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={display.powerSaveEnabled}
              readOnly
              className="w-4 h-4 accent-brand-600"
            />
            Power Save
          </label>
        </div>
      </div>

      {/* 内容区 */}
      <div className="bg-white border-x border-b border-slate-200 rounded-b-md p-4 md:p-6 space-y-6">
        {/* Add Playlist Item 大按钮 */}
        <div className="flex justify-center">
          <button
            onClick={handleAddItem}
            className="w-full max-w-md bg-brand-500 hover:bg-brand-600 text-white font-medium py-3 px-6 rounded-full shadow-sm transition-colors"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" />
              Add Playlist Item
            </span>
          </button>
        </div>

        {/* Playlist 标题区 */}
        <div className="flex items-start justify-between gap-4 pt-2">
          <div>
            <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">PlayList</h2>
            <div className="text-sm text-slate-500 mt-1">
              Last Updated: {formatDateTime(playlist.lastUpdatedAt)}
              {playlist.lastUpdatedBy && <> by <span className="font-medium text-slate-700">Rise Ticker Admin</span></>}
            </div>
          </div>
          <button
            onClick={toggleSelectAll}
            className="p-1.5 text-slate-500 hover:text-slate-700 rounded transition"
            title={allSelected ? 'Deselect all' : 'Select all'}
          >
            {allSelected ? (
              <CheckSquare className="w-5 h-5 text-brand-600" />
            ) : (
              <Square className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Items 列表 */}
        <div className="border-t border-slate-200">
          {items.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              No items in the playlist yet. Click <span className="font-semibold text-brand-600">Add Playlist Item</span> above.
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {items.map((item, index) => {
                const meta = ITEM_TYPE_META[item.itemType] ?? { label: item.itemType, icon: '📋' }
                return (
                  <li key={item.id} className="py-3 flex items-center gap-4">
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button
                        onClick={() => handleMoveItem(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-slate-400 hover:text-brand-700 hover:bg-brand-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMoveItem(index, 'down')}
                        disabled={index === items.length - 1}
                        className="p-1 text-slate-400 hover:text-brand-700 hover:bg-brand-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-shrink-0 w-11 h-11 rounded-full bg-brand-100 flex items-center justify-center text-2xl">
                      <span className="inline-block" aria-hidden>{item.icon ?? meta.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 truncate">{item.name || meta.label}</div>
                      <div className="text-sm text-slate-500">
                        {item.scheduleType === 'ALWAYS' ? 'Always' : item.scheduleType}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditItem(item)}
                        className="p-2 text-slate-400 hover:text-brand-700 hover:bg-brand-50 rounded transition"
                        title="Edit"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDuplicateItem(item)}
                        className="p-2 text-slate-400 hover:text-brand-700 hover:bg-brand-50 rounded transition"
                        title="Duplicate"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ kind: 'item', id: item.id, name: item.name || meta.label })}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        title="Delete"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Publish 按钮 */}
        <div className="flex justify-center pt-4">
          <button
            onClick={handlePublish}
            disabled={!canPublish || playlist.isPublished}
            className={`w-full max-w-md font-medium py-3 px-6 rounded-full shadow-sm transition-colors ${
              canPublish && !playlist.isPublished
                ? 'bg-brand-500 hover:bg-brand-600 text-white'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {playlist.isPublished ? '✓ Published' : 'Publish'}
          </button>
        </div>
      </div>

      {/* 删除确认 Modal */}
      <Modal
        open={!!deleteTarget}
        title="Confirm Delete"
        size="sm"
        onClose={() => setDeleteTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-md transition"
            >
              Delete
            </button>
          </div>
        }
      >
        {deleteTarget && (
          <div className="space-y-2">
            <div className="flex items-start gap-3 text-red-700 bg-red-50 border border-red-200 rounded p-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                Are you sure you want to delete playlist item{' '}
                <span className="font-semibold">"{deleteTarget.name}"</span>? This action cannot be undone.
              </div>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
