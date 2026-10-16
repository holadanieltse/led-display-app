// 轻量 Toast：右下角浮层，自动消失
import { useEffect } from 'react'
import { CheckCircle2, XCircle, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

type Props = {
  message: string
  type?: ToastType
  onClose: () => void
  duration?: number
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const COLORS = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
}

const ICON_COLORS = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-blue-500',
}

export function Toast({ message, type = 'info', onClose, duration = 3000 }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [onClose, duration])

  const Icon = ICONS[type]
  return (
    <div className="fixed bottom-4 right-4 z-[60] animate-in slide-in-from-bottom-2">
      <div className={`flex items-center gap-2 px-4 py-3 rounded-md border shadow-lg ${COLORS[type]}`}>
        <Icon className={`w-5 h-5 flex-shrink-0 ${ICON_COLORS[type]}`} />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  )
}
