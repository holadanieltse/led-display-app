// 用户创建/编辑表单：按当前登录角色动态限定可选角色与组织
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { usersApi } from '../../services/organizations'
import { useAuthStore } from '../../stores/authStore'
import type { User, Organization } from '../../types'
import type { UserRole as UserRoleType } from '../../types/auth'

type FormRole = Exclude<UserRoleType, 'SUPER_ADMIN'> | 'SUPER_ADMIN'

const baseSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  name: z.string().max(120).optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
  role: z.enum(['USER', 'ORG_ADMIN', 'ORG_OWNER', 'SUPER_ADMIN'] as const satisfies readonly FormRole[]),
  orgId: z.string().min(1, 'Please select an organization'),
})

type CreateMode = { mode: 'create' }
type UpdateMode = { mode: 'update'; user: User }
type Props = {
  open: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  organizations: Organization[] // 用于 SUPER_ADMIN 的组织下拉；ORG_OWNER 忽略
} & (CreateMode | UpdateMode)

const ROLE_LABEL: Record<UserRoleType, string> = {
  SUPER_ADMIN: 'Platform Admin (SUPER_ADMIN)',
  ORG_OWNER: 'Organization Owner (ORG_OWNER)',
  ORG_ADMIN: 'Organization Admin (ORG_ADMIN)',
  USER: 'Regular User (USER)',
}

export function UserForm(props: Props) {
  const { open, onClose, onSuccess, organizations } = props
  const isEdit = props.mode === 'update'
  const editingUser = isEdit ? props.user : null

  const currentUser = useAuthStore((s) => s.user)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin())

  // 按角色过滤可选角色列表
  const selectableRoles = (() => {
    const userRole = currentUser?.role
    if (!userRole) return ['USER'] as UserRoleType[]
    if (userRole === 'SUPER_ADMIN') return ['SUPER_ADMIN', 'ORG_OWNER', 'ORG_ADMIN', 'USER'] as UserRoleType[]
    // ORG_OWNER：不能创建/提升为 SUPER_ADMIN 或 ORG_OWNER
    return ['ORG_ADMIN', 'USER'] as UserRoleType[]
  })()

  // 按角色控制 org 是否可编辑
  const orgEditable = isSuperAdmin // ORG_OWNER 强制锁定为自己组织
  const currentOrgId = isSuperAdmin ? undefined : currentUser?.orgId

  // 编辑时：ORG_OWNER 不能编辑 SUPER_ADMIN
  useEffect(() => {
    if (open && isEdit && editingUser && !isSuperAdmin && editingUser.role === 'SUPER_ADMIN') {
      onClose()
    }
  }, [open, isEdit, editingUser, isSuperAdmin, onClose])

  // schema: create 模式密码必填；update 模式密码可为空（代表不改）
  const schema = isEdit
    ? baseSchema.partial().extend({
        email: baseSchema.shape.email.optional(),
        role: baseSchema.shape.role,
        orgId: baseSchema.shape.orgId,
      })
    : baseSchema

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof baseSchema>>({
    resolver: zodResolver(schema as never),
    defaultValues: {
      role: 'USER' as FormRole,
    },
  })

  useEffect(() => {
    if (!open) return
    if (isEdit && editingUser) {
      reset({
        email: editingUser.email,
        name: editingUser.name ?? '',
        password: '',
        role: editingUser.role as FormRole,
        orgId: editingUser.orgId,
      })
    } else {
      reset({
        email: '',
        name: '',
        password: '',
        role: 'USER' as FormRole,
        orgId: currentOrgId ?? organizations[0]?.id ?? '',
      })
    }
  }, [open, isEdit, editingUser, currentOrgId, organizations, reset])

  const onSubmit = async (raw: z.infer<typeof baseSchema>) => {
    const payload = {
      email: raw.email?.trim(),
      name: raw.name?.trim() || undefined,
      password: raw.password || undefined,
      role: raw.role,
      orgId: raw.orgId,
    }

    if (isEdit && editingUser) {
      // 编辑时不发送 orgId（后端不允许改），密码为空时省略
      const upd: Record<string, unknown> = {}
      if (payload.email) upd.email = payload.email.toLowerCase()
      if (payload.name !== undefined) upd.name = payload.name || null
      if (payload.password) upd.password = payload.password
      if (payload.role) upd.role = payload.role
      await usersApi.update(editingUser.id, upd)
      onSuccess(`User "${payload.email || editingUser.email}" updated`)
    } else {
      await usersApi.create({
        email: (payload.email as string).toLowerCase(),
        name: payload.name as string | undefined,
        password: payload.password as string,
        role: payload.role as string,
        orgId: payload.orgId as string,
      })
      onSuccess(`User "${payload.email}" created`)
    }
    onClose()
  }

  const watchRole = watch('role') as UserRoleType | undefined

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit User' : 'New User'}
      onClose={onClose}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="user-form"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-white bg-brand-500 hover:bg-brand-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
          >
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      }
    >
      <form id="user-form" onSubmit={handleSubmit(onSubmit as never)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            {...register('email')}
            placeholder="you@example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
          />
          {errors.email && <p className="mt-1 text-xs text-red-500">{(errors.email as { message?: string })?.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
          <input
            type="text"
            {...register('name')}
            placeholder="John Smith"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {isEdit ? 'New Password (leave blank to keep)' : 'Password <span className="text-red-500">*</span>'}
            {isEdit && <span className="text-xs text-gray-400 ml-2">At least 6 characters, leave blank to keep current</span>}
            {!isEdit && <span className="text-red-500"> *</span>}
          </label>
          <input
            type="password"
            autoComplete="new-password"
            {...register('password')}
            placeholder={isEdit ? '•••••• (optional)' : '••••••'}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
          />
          {errors.password && <p className="mt-1 text-xs text-red-500">{(errors.password as { message?: string })?.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Role {!isSuperAdmin && !isEdit && <span className="text-xs text-gray-400 ml-1">(Highest you can create: ORG_ADMIN)</span>}
            </label>
            <select
              {...register('role')}
              disabled={isEdit && editingUser?.role === 'SUPER_ADMIN' && !isSuperAdmin} // ORG_OWNER 改 SUPER_ADMIN 时禁用
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition disabled:bg-gray-100 disabled:text-gray-500"
            >
              {selectableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
              {/* 编辑 SUPER_ADMIN 时保证可选 */}
              {isEdit && editingUser?.role === 'SUPER_ADMIN' && !selectableRoles.includes('SUPER_ADMIN') && (
                <option value="SUPER_ADMIN">{ROLE_LABEL.SUPER_ADMIN}</option>
              )}
            </select>
            {watchRole === 'SUPER_ADMIN' && (
              <p className="mt-1 text-[10px] text-amber-600">⚠️ This role has the highest platform privileges and can see all organizations' data</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Organization {!orgEditable && <span className="text-xs text-gray-400 ml-1">(current org, non-editable)</span>}
            </label>
            <select
              {...register('orgId')}
              disabled={!orgEditable}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition disabled:bg-gray-100 disabled:text-gray-500"
            >
              {orgEditable ? (
                organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))
              ) : (
                <option value={currentOrgId}>
                  {organizations.find((o) => o.id === currentOrgId)?.name || 'Current Organization'}
                </option>
              )}
            </select>
            {errors.orgId && <p className="mt-1 text-xs text-red-500">{(errors.orgId as { message?: string })?.message}</p>}
          </div>
        </div>
      </form>
    </Modal>
  )
}
