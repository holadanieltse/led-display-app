// 显示屏创建/编辑表单
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { displaysApi } from '../../services/organizations'
import type { Display, DisplayType, DisplayStatus } from '../../types'

const schema = z.object({
  name: z.string().min(1, 'Display name is required').max(120),
  macAddress: z
    .string()
    .regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/, 'Invalid MAC address (expected AA:BB:CC:DD:EE:FF)'),
  signId: z.string().optional().or(z.literal('')),
  firmwareVersion: z.string().optional().or(z.literal('')),
  type: z.enum(['TICKER', 'DIGITAL', 'HTML_FEED']),
  status: z.enum(['ONLINE', 'OFFLINE', 'ERROR']),
  tickerHeight: z.coerce.number().int().min(1).max(256).optional().or(z.literal('')),
  timezone: z.string().min(1, 'Timezone is required').default('UTC'),
  timezoneRegion: z.string().optional().or(z.literal('')),
  scrollSpeed: z.coerce.number().int().min(0).max(100),
  brightness: z.coerce.number().int().min(0).max(100),
  powerSaveEnabled: z.boolean(),
  tickerOnTime: z.string(),
  tickerOffTime: z.string(),
})
type FormData = z.infer<typeof schema>

type Props = {
  open: boolean
  onClose: () => void
  onSuccess: (msg: string) => void
  // 创建时所属组织 ID（SUPER_ADMIN 创建时需要）
  orgId?: string
  // 编辑模式时传入现有显示屏
  display?: Display | null
  // 创建时的预设类型
  defaultType?: DisplayType
}

const TYPE_LABELS: Record<DisplayType, string> = {
  TICKER: 'Ticker Display',
  DIGITAL: 'Digital Display',
  HTML_FEED: 'HTML Feed',
}

export function DisplayForm({ open, onClose, onSuccess, orgId, display, defaultType = 'TICKER' }: Props) {
  const isEdit = !!display

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: defaultType,
      status: 'OFFLINE',
      scrollSpeed: 50,
      brightness: 50,
      powerSaveEnabled: true,
      tickerOnTime: '07:30',
      tickerOffTime: '22:00',
      timezone: 'UTC',
    },
  })

  const currentType = watch('type')

  useEffect(() => {
    if (open) {
      if (display) {
        reset({
          name: display.name,
          macAddress: display.macAddress,
          signId: display.signId ?? '',
          firmwareVersion: display.firmwareVersion ?? '',
          type: display.type,
          status: display.status,
          tickerHeight: display.tickerHeight ?? undefined,
          timezone: display.timezone,
          timezoneRegion: display.timezoneRegion ?? '',
          scrollSpeed: display.scrollSpeed,
          brightness: display.brightness,
          powerSaveEnabled: display.powerSaveEnabled,
          tickerOnTime: display.tickerOnTime,
          tickerOffTime: display.tickerOffTime,
        })
      } else {
        reset({
          name: '',
          macAddress: '',
          signId: '',
          firmwareVersion: '',
          type: defaultType,
          status: 'OFFLINE',
          tickerHeight: undefined,
          timezone: 'UTC',
          timezoneRegion: '',
          scrollSpeed: 50,
          brightness: 50,
          powerSaveEnabled: true,
          tickerOnTime: '07:30',
          tickerOffTime: '22:00',
        })
      }
    }
  }, [open, display, defaultType, reset])

  const onSubmit = async (data: FormData) => {
    const payload = {
      name: data.name.trim(),
      macAddress: data.macAddress.toUpperCase(),
      signId: data.signId?.trim() || undefined,
      firmwareVersion: data.firmwareVersion?.trim() || undefined,
      type: data.type,
      status: data.status,
      tickerHeight: data.tickerHeight || undefined,
      timezone: data.timezone,
      timezoneRegion: data.timezoneRegion?.trim() || undefined,
      scrollSpeed: data.scrollSpeed,
      brightness: data.brightness,
      powerSaveEnabled: data.powerSaveEnabled,
      tickerOnTime: data.tickerOnTime,
      tickerOffTime: data.tickerOffTime,
    }

    if (isEdit && display) {
      await displaysApi.update(display.id, payload)
      onSuccess(`Display "${payload.name}" updated`)
    } else {
      if (!orgId) throw new Error('orgId is required for creating display')
      await displaysApi.create({ ...payload, orgId })
      onSuccess(`Display "${payload.name}" created`)
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${TYPE_LABELS[display?.type ?? defaultType]}` : `New ${TYPE_LABELS[defaultType]}`}
      onClose={onClose}
      size="lg"
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
            form="display-form"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-white bg-brand-500 hover:bg-brand-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
          >
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Display'}
          </button>
        </div>
      }
    >
      <form id="display-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* 基础信息 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('name')}
              placeholder="e.g. Lobby Ticker"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              MAC Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('macAddress')}
              placeholder="00:80:A3:EE:21:61"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
            />
            {errors.macAddress && <p className="mt-1 text-xs text-red-500">{errors.macAddress.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Sign ID</label>
            <input
              type="text"
              {...register('signId')}
              placeholder="0080A3EE2161"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
            <select
              {...register('type')}
              disabled={isEdit}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="TICKER">Ticker Display</option>
              <option value="DIGITAL">Digital Display</option>
              <option value="HTML_FEED">HTML Feed</option>
            </select>
            {isEdit && <p className="mt-1 text-[10px] text-gray-400">Type cannot be changed after creation</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
            <select
              {...register('status')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
            >
              <option value="OFFLINE">OFFLINE</option>
              <option value="ONLINE">ONLINE</option>
              <option value="ERROR">ERROR</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Firmware Version</label>
            <input
              type="text"
              {...register('firmwareVersion')}
              placeholder="V2"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
            />
          </div>

          {currentType === 'TICKER' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Ticker Height (px)</label>
              <input
                type="number"
                {...register('tickerHeight')}
                placeholder="16 / 32 / 64"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
              />
            </div>
          )}
        </div>

        {/* 时区 & 配置 */}
        <div className="pt-3 border-t border-gray-100">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Timezone & Settings</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Timezone</label>
              <input
                type="text"
                {...register('timezone')}
                placeholder="UTC"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
              />
              {errors.timezone && <p className="mt-1 text-xs text-red-500">{errors.timezone.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Timezone Region</label>
              <input
                type="text"
                {...register('timezoneRegion')}
                placeholder="e.g. Central / Kolkata"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Scroll Speed ({watch('scrollSpeed')})
              </label>
              <input
                type="range"
                min={0}
                max={100}
                {...register('scrollSpeed')}
                className="w-full accent-brand-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Brightness ({watch('brightness')})
              </label>
              <input
                type="range"
                min={0}
                max={100}
                {...register('brightness')}
                className="w-full accent-brand-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">On Time</label>
              <input
                type="time"
                {...register('tickerOnTime')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Off Time</label>
              <input
                type="time"
                {...register('tickerOffTime')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
              />
            </div>

            <div className="col-span-2">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('powerSaveEnabled')}
                  className="w-4 h-4 accent-brand-500"
                />
                <span className="text-sm text-gray-700">Enable Power Save</span>
              </label>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  )
}
