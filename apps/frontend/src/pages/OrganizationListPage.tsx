import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Pencil, Trash2, Users, Monitor, ChevronDown, ChevronUp, RefreshCw, AlertTriangle } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Modal } from '../components/ui/Modal'
import { Toast, type ToastType } from '../components/ui/Toast'
import { DeviceControlPopover } from '../components/DeviceControlPopover'
import { OrganizationForm } from '../components/forms/OrganizationForm'
import { DisplayForm } from '../components/forms/DisplayForm'
import { organizationsApi, displaysApi } from '../services/organizations'
import { useAuthStore } from '../stores/authStore'
import type { Organization, Display, DisplayType, DisplayStatus } from '../types'

type DisplayTab = 'ticker' | 'digital' | 'html'

export default function OrganizationListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [displayTab, setDisplayTab] = useState<DisplayTab>('ticker')
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [displaysByOrg, setDisplaysByOrg] = useState<Record<string, Display[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 弹窗状态
  const [orgFormOpen, setOrgFormOpen] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [displayFormOpen, setDisplayFormOpen] = useState(false)
  const [editingDisplay, setEditingDisplay] = useState<Display | null>(null)
  const [displayFormOrgId, setDisplayFormOrgId] = useState<string | undefined>(undefined)
  const [displayFormType, setDisplayFormType] = useState<DisplayType>('TICKER')

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'org' | 'display'; id: string; name: string; orgId?: string } | null>(null)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin())
  const canManageDisplays = useAuthStore((s) => s.canManageDisplays())

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type })
  }

  const loadOrgs = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await organizationsApi.list()
      setOrgs(data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } }
      setError(e.response?.data?.error?.message ?? 'Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOrgs()
  }, [])

  // 展开组织时拉取该组织的显示屏
  const toggleExpand = async (orgId: string) => {
    const willOpen = !expanded[orgId]
    setExpanded((e) => ({ ...e, [orgId]: willOpen }))
    if (willOpen && !displaysByOrg[orgId]) {
      try {
        const displays = await displaysApi.list(orgId)
        setDisplaysByOrg((d) => ({ ...d, [orgId]: displays }))
      } catch {
        // 忽略
      }
    }
  }

  // 重新加载某个组织的显示屏
  const reloadDisplays = async (orgId: string) => {
    try {
      const displays = await displaysApi.list(orgId)
      setDisplaysByOrg((d) => ({ ...d, [orgId]: displays }))
    } catch {
      // 忽略
    }
  }

  // 设备命令成功后，本地更新显示屏状态（避免整表刷新）
  const handleDeviceStatusChange = (displayId: string, status: DisplayStatus) => {
    setDisplaysByOrg((prev) => {
      const next: Record<string, Display[]> = {}
      for (const [orgId, displays] of Object.entries(prev)) {
        next[orgId] = displays.map((d) =>
          d.id === displayId ? { ...d, status, lastSeenAt: status === 'ONLINE' ? new Date().toISOString() : d.lastSeenAt } : d,
        )
      }
      return next
    })
  }

  const filteredOrgs = orgs.filter((o) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      o.name.toLowerCase().includes(q) ||
      (o.primaryContactEmail ?? '').toLowerCase().includes(q) ||
      (o.primaryContactName ?? '').toLowerCase().includes(q)
    )
  })

  const filterDisplays = (displays: Display[], tab: DisplayTab) => {
    const typeMap: Record<DisplayTab, DisplayType> = {
      ticker: 'TICKER',
      digital: 'DIGITAL',
      html: 'HTML_FEED',
    }
    return displays.filter((d) => d.type === typeMap[tab])
  }

  // 打开创建组织表单
  const handleAddOrg = () => {
    setEditingOrg(null)
    setOrgFormOpen(true)
  }

  // 打开编辑组织表单
  const handleEditOrg = (org: Organization) => {
    setEditingOrg(org)
    setOrgFormOpen(true)
  }

  // 组织表单成功回调
  const handleOrgFormSuccess = async (_msg: string) => {
    await loadOrgs()
    showToast(_msg, 'success')
  }

  // 打开创建显示屏表单
  const handleAddDisplay = (orgId: string, type: DisplayType) => {
    setEditingDisplay(null)
    setDisplayFormOrgId(orgId)
    setDisplayFormType(type)
    setDisplayFormOpen(true)
  }

  // 打开编辑显示屏表单
  const handleEditDisplay = (display: Display) => {
    setEditingDisplay(display)
    setDisplayFormOrgId(display.orgId)
    setDisplayFormType(display.type)
    setDisplayFormOpen(true)
  }

  // 显示屏表单成功回调
  const handleDisplayFormSuccess = async (msg: string) => {
    if (displayFormOrgId) {
      await reloadDisplays(displayFormOrgId)
      // 更新组织列表的 displayCount
      await loadOrgs()
    }
    showToast(msg, 'success')
  }

  // 删除确认
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.kind === 'org') {
        await organizationsApi.remove(deleteTarget.id)
        // 清理本地状态
        setDisplaysByOrg((d) => {
          const next = { ...d }
          delete next[deleteTarget.id]
          return next
        })
        setExpanded((e) => {
          const next = { ...e }
          delete next[deleteTarget.id]
          return next
        })
        await loadOrgs()
        showToast(`Organization "${deleteTarget.name}" deleted`, 'success')
      } else {
        await displaysApi.remove(deleteTarget.id)
        if (deleteTarget.orgId) {
          await reloadDisplays(deleteTarget.orgId)
          await loadOrgs()
        }
        showToast(`Display "${deleteTarget.name}" deleted`, 'success')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } }
      showToast(e.response?.data?.error?.message ?? 'Delete failed', 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Organization Management"
        actions={
          <>
            <button
              onClick={loadOrgs}
              disabled={loading}
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {isSuperAdmin && (
              <button
                onClick={handleAddOrg}
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add an Organization
              </button>
            )}
          </>
        }
      />

      <div className="mx-4 md:mx-6 mt-4 md:mt-6">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Search Bar */}
        <div className="bg-white border border-gray-200 rounded-t-md px-4 py-3 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Organization name or email"
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
            />
          </div>
          <div className="text-xs text-gray-400">{filteredOrgs.length} organizations</div>
        </div>

        {/* Table — horizontal scroll on small screens */}
        <div className="bg-white border-x border-b border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium w-64">Organization</th>
                <th className="text-left px-4 py-3 font-medium w-64">Primary Contact</th>
                <th className="text-left px-4 py-3 font-medium w-36">Users</th>
                <th className="text-left px-4 py-3 font-medium w-36">Displays</th>
                <th className="text-right px-4 py-3 font-medium w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrgs.map((org) => {
                const isOpen = !!expanded[org.id]
                const displays = displaysByOrg[org.id] ?? []
                return (
                  <Fragment key={org.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-4 font-semibold text-gray-900">{org.name}</td>
                      <td className="px-4 py-4">
                        <div className="text-gray-900">{org.primaryContactName ?? '—'}</div>
                        <div className="text-gray-500 text-xs">{org.primaryContactEmail ?? '—'}</div>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleExpand(org.id)}
                          className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 text-sm underline decoration-dotted"
                        >
                          <Users className="w-3.5 h-3.5" />
                          {org.userCount} User{org.userCount !== 1 ? 's' : ''}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleExpand(org.id)}
                          className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 text-sm underline decoration-dotted"
                        >
                          <Monitor className="w-3.5 h-3.5" />
                          {org.displayCount} Display{org.displayCount !== 1 ? 's' : ''}
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {isSuperAdmin && (
                            <button
                              onClick={() => setDeleteTarget({ kind: 'org', id: org.id, name: org.name })}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded transition"
                              title="Delete organization"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleEditOrg(org)}
                            className="p-1.5 text-brand-600 hover:bg-brand-50 rounded transition"
                            title="Edit organization"
                          >
                            <Pencil className="w-4.5 h-4.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="flex items-center justify-between mb-3 text-xs text-gray-700 font-medium">
                            <div className="bg-gray-100 px-3 py-1.5 rounded">
                              Display(s) associated with {org.name}
                            </div>
                            {canManageDisplays && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleAddDisplay(org.id, 'TICKER')}
                                  className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded text-xs font-medium transition"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Add Ticker Display
                                </button>
                                <button
                                  onClick={() => handleAddDisplay(org.id, 'DIGITAL')}
                                  className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded text-xs font-medium transition"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Add Digital Display
                                </button>
                                <button
                                  onClick={() => handleAddDisplay(org.id, 'HTML_FEED')}
                                  className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded text-xs font-medium transition"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Add HTML Feed
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Tabs */}
                          <div className="flex border-b border-gray-200 mb-0">
                            {([
                              { k: 'ticker', label: 'Ticker Displays' },
                              { k: 'digital', label: 'Digital Displays' },
                              { k: 'html', label: 'HTML Feeds' },
                            ] as const).map((t) => (
                              <button
                                key={t.k}
                                onClick={() => setDisplayTab(t.k)}
                                className={[
                                  'px-4 py-2 text-xs font-medium border-b-2 transition -mb-px',
                                  displayTab === t.k
                                    ? 'border-brand-500 text-gray-900 bg-white'
                                    : 'border-transparent text-gray-500 hover:text-gray-700',
                                ].join(' ')}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>

                          {/* Display 表格 */}
                          <div className="bg-white border border-gray-200 border-t-0 overflow-x-auto">
                            <table className="w-full text-xs min-w-[900px]">
                              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                                <tr>
                                  <th className="text-left px-4 py-2 font-medium w-56">Name</th>
                                  <th className="text-left px-4 py-2 font-medium w-40">MAC ID</th>
                                  <th className="text-left px-4 py-2 font-medium w-32">Status</th>
                                  <th className="text-left px-4 py-2 font-medium w-36">Subscribed Plan</th>
                                  <th className="text-left px-4 py-2 font-medium w-24">Add Playlist</th>
                                  <th className="text-left px-4 py-2 font-medium w-20">Active</th>
                                  <th className="text-right px-4 py-2 font-medium w-28">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {filterDisplays(displays, displayTab).map((d) => (
                                  <tr key={d.id} className="hover:bg-gray-50/80">
                                    <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                                    <td className="px-4 py-3 font-mono text-[11px] text-gray-600">{d.macAddress}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`inline-block w-2.5 h-2.5 rounded-full ${
                                            d.status === 'ONLINE' ? 'bg-green-500' : 'bg-red-500'
                                          }`}
                                        />
                                        <span className="font-medium text-gray-800">{d.status}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex flex-col gap-1">
                                        {d.plans.length > 0 ? (
                                          d.plans.map((p) => (
                                            <span
                                              key={p}
                                              className="inline-flex items-center gap-1 bg-brand-500 text-white px-2 py-0.5 rounded text-[10px] font-semibold w-fit"
                                            >
                                              {p}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-gray-400">—</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <button
                                        onClick={() => navigate(`/displays/${d.id}`)}
                                        className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-brand-500 hover:bg-brand-600 text-white transition"
                                        title="Add / Manage Playlist"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                    <td className="px-4 py-3">
                                      <label className="inline-flex items-center cursor-pointer">
                                        <span className="relative">
                                          <input type="checkbox" defaultChecked className="peer sr-only" />
                                          <span className="block w-9 h-5 rounded-full bg-gray-300 peer-checked:bg-green-500 transition" />
                                          <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white border border-gray-200 shadow transition peer-checked:translate-x-4" />
                                        </span>
                                      </label>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          onClick={() =>
                                            setDeleteTarget({
                                              kind: 'display',
                                              id: d.id,
                                              name: d.name,
                                              orgId: d.orgId,
                                            })
                                          }
                                          className="p-1.5 text-red-500 hover:bg-red-50 rounded transition"
                                          title="Delete display"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleEditDisplay(d)}
                                          className="p-1.5 text-brand-600 hover:bg-brand-50 rounded transition"
                                          title="Edit display"
                                        >
                                          <Pencil className="w-4 h-4" />
                                        </button>
                                        <DeviceControlPopover
                                          display={d}
                                          onResult={(msg, type) => showToast(msg, type)}
                                          onStatusChange={handleDeviceStatusChange}
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {filterDisplays(displays, displayTab).length === 0 && (
                                  <tr>
                                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-xs">
                                      No{' '}
                                      {displayTab === 'digital'
                                        ? 'Digital Displays'
                                        : displayTab === 'html'
                                        ? 'HTML Feeds'
                                        : 'Ticker Displays'}{' '}
                                      for this organization.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {filteredOrgs.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">
                    No organizations match your search.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">
                    <RefreshCw className="w-5 h-5 animate-spin inline-block mb-2" />
                    <div>Loading organizations...</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 组织表单 */}
      <OrganizationForm
        open={orgFormOpen}
        onClose={() => setOrgFormOpen(false)}
        onSuccess={handleOrgFormSuccess}
        organization={editingOrg}
      />

      {/* 显示屏表单 */}
      <DisplayForm
        open={displayFormOpen}
        onClose={() => setDisplayFormOpen(false)}
        onSuccess={handleDisplayFormSuccess}
        orgId={displayFormOrgId}
        display={editingDisplay}
        defaultType={displayFormType}
      />

      {/* 删除确认 */}
      <Modal
        open={!!deleteTarget}
        title="Confirm Delete"
        onClose={() => setDeleteTarget(null)}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-md transition shadow-sm"
            >
              Confirm Delete
            </button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-700">
              {deleteTarget?.kind === 'org' ? (
                <>
                  Are you sure you want to delete organization <span className="font-semibold">"{deleteTarget?.name}"</span>?
                  <br />
                  <span className="text-xs text-red-500 mt-1 block">
                    This will cascade-delete all displays, users, and playlists under this organization. This cannot be undone.
                  </span>
                </>
              ) : (
                <>
                  Are you sure you want to delete display <span className="font-semibold">"{deleteTarget?.name}"</span>?
                  <br />
                  <span className="text-xs text-red-500 mt-1 block">
                    This will cascade-delete subscriptions and playlists for this display. This cannot be undone.
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </Modal>

      {/* Toast 提示 */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
