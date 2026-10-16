// 组织创建/编辑表单
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { organizationsApi } from '../../services/organizations'
import type { Organization } from '../../types'

const schema = z.object({
  name: z.string().min(1, 'Organization name is required').max(120, 'Name must be 120 characters or fewer'),
  primaryContactName: z.string().max(120).optional().or(z.literal('')),
  primaryContactEmail: z.string().email('Please enter a valid email').optional().or(z.literal('')),
})
type FormData = z.infer<typeof schema>

type Props = {
  open: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  // 编辑模式时传入现有组织；创建模式为 null
  organization?: Organization | null
}

export function OrganizationForm({ open, onClose, onSuccess, organization }: Props) {
  const isEdit = !!organization

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  // 打开时同步初始值
  useEffect(() => {
    if (open) {
      reset({
        name: organization?.name ?? '',
        primaryContactName: organization?.primaryContactName ?? '',
        primaryContactEmail: organization?.primaryContactEmail ?? '',
      })
    }
  }, [open, organization, reset])

  const onSubmit = async (data: FormData) => {
    const payload = {
      name: data.name.trim(),
      primaryContactName: data.primaryContactName?.trim() || undefined,
      primaryContactEmail: data.primaryContactEmail?.trim() || undefined,
    }
    if (isEdit && organization) {
      await organizationsApi.update(organization.id, payload)
      onSuccess(`Organization "${payload.name}" updated`)
    } else {
      await organizationsApi.create(payload)
      onSuccess(`Organization "${payload.name}" created`)
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit Organization' : 'New Organization'}
      onClose={onClose}
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
            form="org-form"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-white bg-brand-500 hover:bg-brand-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
          >
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Organization'}
          </button>
        </div>
      }
    >
      <form id="org-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Organization Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            {...register('name')}
            placeholder="e.g. Acme Corporation"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Primary Contact Name</label>
          <input
            type="text"
            {...register('primaryContactName')}
            placeholder="e.g. John Smith"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Primary Contact Email</label>
          <input
            type="email"
            {...register('primaryContactEmail')}
            placeholder="contact@example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
          />
          {errors.primaryContactEmail && (
            <p className="mt-1 text-xs text-red-500">{errors.primaryContactEmail.message}</p>
          )}
        </div>

        <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
          {isEdit ? 'Changes take effect immediately and sync to the backend in real time.' : 'After creation, you can add displays and users under this organization.'}
        </p>
      </form>
    </Modal>
  )
}
