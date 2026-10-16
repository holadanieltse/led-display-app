// 用户管理列表页：按角色控制可见范围与操作按钮
import { useEffect, useState } from 'react'
import { Search, Plus, Pencil, Trash2, RefreshCw, AlertTriangle, User2, Building2, Shield, Calendar } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Modal } from '../components/ui/Modal'
import { Toast, type ToastType } from '../components/ui/Toast'
import { UserForm } from '../components/forms/UserForm'
import { organizationsApi, usersApi } from '../services/organizations'
import { useAuthStore } from '../stores/authStore'
import type { User, Organization } from '../types'

const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-800 border-purple-200',
  ORG_OWNER: 'bg-brand-100 text-brand-800 border-brand-200',
  ORG_ADMIN: 'bg-blue-100 text-blue-800 border-blue-200',
  USER: 'bg-gray-100 text-gray-700 border-gray-200',
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ORG_OWNER: 'ORG_OWNER',
  ORG_ADMIN: 'ORG_ADMIN',
  USER: 'USER',
}

export default function UserListPage() {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 表单弹窗
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const currentUser = useAuthStore((s) => s.user)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin())
  const canCreate = isSuperAdmin || currentUser?.role === 'ORG_OWNER'

  const showToast = (message: string, type: ToastType = 'success') => setToast({ message, type })

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [userList, orgList] = await Promise.all([usersApi.list(), organizationsApi.list()])
      setUsers(userList)
      setOrgs(orgList)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } }
      setError(e.response?.data?.error?.message ?? 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const orgNameById = (orgId: string) => orgs.find((o) => o.id === orgId)?.name ?? '—'

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      u.email.toLowerCase().includes(q) ||
      (u.name ?? '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      orgNameById(u.orgId).toLowerCase().includes(q)
    )
  })

  const handleCreate = () => {
    setEditingUser(null)
    setFormOpen(true)
  }

  const handleEdit = (u: User) => {
    setEditingUser(u)
    setFormOpen(true)
  }

  const handleFormSuccess = async (msg: string) => {
    await load()
    showToast(msg, 'success')
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await usersApi.remove(deleteTarget.id)
      await load()
      showToast(`User "${deleteTarget.email}" deleted`, 'success')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } }
      showToast(e.response?.data?.error?.message ?? 'Delete failed', 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  // ORG_OWNER 不能删除 SUPER_ADMIN；所有人不能删自己
  const canDelete = (u: User) => {
    if (u.id === currentUser?.id) return false
    if (!isSuperAdmin && u.role === 'SUPER_ADMIN') return false
    return true
  }

  // ORG_OWNER 不能编辑 SUPER_ADMIN
  const canEdit = (u: User) => {
    if (!isSuperAdmin && u.role === 'SUPER_ADMIN') return false
    return true
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle={
          isSuperAdmin
            ? 'Manage all users across organizations with any role'
            : 'Manage users in your organization. You can create ORG_ADMIN and USER roles'
        }
        actions={
          <>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {canCreate && (
              <button
                onClick={handleCreate}
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add a User
              </button>
            )}
          </>
        }
      />

      <div className="mx-6 mt-6">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {(['SUPER_ADMIN', 'ORG_OWNER', 'ORG_ADMIN', 'USER'] as const).map((role) => {
            const count = users.filter((u) => u.role === role).length
            return (
              <div
                key={role}
                className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                    {ROLE_LABEL[role]}
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mt-0.5">{count}</div>
                </div>
                <div className={`px-2 py-1 rounded border text-[10px] font-semibold ${ROLE_STYLES[role]}`}>
                  {ROLE_LABEL[role]}
                </div>
              </div>
            )
          })}
        </div>

        {/* Search */}
        <div className="bg-white border border-gray-200 rounded-t-md px-4 py-3 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email, name, role or organization"
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
            />
          </div>
          <div className="text-xs text-gray-400">{filtered.length} users</div>
        </div>

        {/* Table */}
        <div className="bg-white border-x border-b border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium w-56">User</th>
                <th className="text-left px-4 py-3 font-medium w-28">Role</th>
                <th className="text-left px-4 py-3 font-medium w-40">Organization</th>
                <th className="text-left px-4 py-3 font-medium w-40">Created</th>
                <th className="text-right px-4 py-3 font-medium w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => {
                const isSelf = u.id === currentUser?.id
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm">
                          {((u.name || u.email).charAt(0)).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 truncate">
                              {u.name || <span className="italic text-gray-400">Not set</span>}
                            </span>
                            {isSelf && (
                              <span className="px-1.5 py-0.5 text-[9px] uppercase bg-blue-50 text-blue-700 border border-blue-200 rounded font-semibold">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-md border text-[11px] font-semibold ${ROLE_STYLES[u.role]}`}>
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="inline-flex items-center gap-1.5 text-gray-700">
                        <Building2 className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm truncate max-w-[160px]">{orgNameById(u.orgId)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="inline-flex items-center gap-1.5 text-gray-500 text-xs">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {new Date(u.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setDeleteTarget(u)}
                          disabled={!canDelete(u)}
                          className={`p-1.5 rounded transition ${
                            canDelete(u)
                              ? 'text-red-500 hover:bg-red-50'
                              : 'text-gray-300 cursor-not-allowed'
                          }`}
                          title={
                            !canDelete(u)
                              ? u.id === currentUser?.id
                                ? 'Cannot delete yourself'
                                : 'You do not have permission to delete this user'
                              : 'Delete user'
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(u)}
                          disabled={!canEdit(u)}
                          className={`p-1.5 rounded transition ${
                            canEdit(u)
                              ? 'text-brand-600 hover:bg-brand-50'
                              : 'text-gray-300 cursor-not-allowed'
                          }`}
                          title={!canEdit(u) ? 'You do not have permission to edit this user' : 'Edit user'}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">
                    No users match your search.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">
                    <RefreshCw className="w-5 h-5 animate-spin inline-block mb-2" />
                    <div>Loading users...</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 用户表单 */}
      <UserForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={handleFormSuccess}
        organizations={orgs}
        {...(editingUser ? { mode: 'update' as const, user: editingUser } : { mode: 'create' as const })}
      />

      {/* 删除确认 */}
      <Modal
        open={!!deleteTarget}
        title="Confirm Delete User"
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
              Are you sure you want to delete user{' '}
              <span className="font-semibold">{deleteTarget?.email}</span>{' '}
              {deleteTarget?.name ? `(${deleteTarget.name})` : ''}?
            </p>
            <p className="text-xs text-red-500 mt-1">
              Data created by this user (displays, playlists, etc.) will not be deleted, but the user will no longer be able to sign in.
            </p>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
