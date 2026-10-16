// Display Info & Settings Modal: 11-button hardware control console matching RISE Ticker spec.
// Includes "Send Command" terminal and "CommandLine Logs" serial port response inspector.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X,
  Power,
  RotateCw,
  RotateCcw,
  Trash2,
  AlignLeft,
  Info,
  Download,
  Wifi,
  Calendar,
  Menu,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ExternalLink,
  Save,
  Activity,
  List,
  Copy,
  Check,
} from 'lucide-react'
import { devicesApi, displaysApi, playlistsApi } from '../services/organizations'
import type { Display, DeviceCommand, Playlist } from '../types'
import type { ToastType } from './ui/Toast'

type Props = {
  display: Display
  onResult?: (message: string, type: ToastType) => void
  onStatusChange?: (displayId: string, status: Display['status']) => void
}

type SubView =
  | 'main'
  | 'send-command'
  | 'command-logs'
  | 'ticker-data'
  | 'queue-status'
  | 'install-font'
  | 'network'
  | 'automated-cache'

type LogEntry = {
  id: string
  date: string
  time: string
  command: string
  response: string
}

const DEFAULT_LOGS: LogEntry[] = [
  {
    id: 'log-1',
    date: 'Sep 16, 2026',
    time: '05:44:06PM',
    command: '^B01^ACSM$1S0$V1bb9^AB$1S0$^S$MLB.png!^W0^F$SS16$^O$F:#FFFFFF$BAL vs NYY^M^F$SS16$^O$F:#00FF00$4 - 2 (Final)^L^F$SS32$  ^C',
    response: '--',
  },
  {
    id: 'log-2',
    date: 'Sep 16, 2026',
    time: '05:42:23PM',
    command: '^B01^ACRA^D217^C',
    response: '--',
  },
  {
    id: 'log-3',
    date: 'Sep 16, 2026',
    time: '05:41:20PM',
    command: '^B01^ACST024120^ACSD091620263^C',
    response: '--',
  },
  {
    id: 'log-4',
    date: 'Sep 16, 2026',
    time: '05:41:01PM',
    command: '^B01^ACRA^D217^C',
    response: '--',
  },
  {
    id: 'log-5',
    date: 'Sep 16, 2026',
    time: '05:40:17PM',
    command: '^B01^ACRA^D217^C',
    response: '--',
  },
  {
    id: 'log-6',
    date: 'Sep 16, 2026',
    time: '05:39:46PM',
    command: '^B01^ACRA^D217^C',
    response: '--',
  },
  {
    id: 'log-7',
    date: 'Sep 16, 2026',
    time: '05:39:30PM',
    command: '^B01^ACRA^D217^C',
    response: '--',
  },
  {
    id: 'log-8',
    date: 'Sep 16, 2026',
    time: '05:35:09PM',
    command: '^B01^ACRA^D217^C',
    response: '--',
  },
]

export function DeviceControlPopover({ display, onResult, onStatusChange }: Props) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [currentView, setCurrentView] = useState<SubView>('main')

  // Execution state
  const [pendingCmd, setPendingCmd] = useState<string | null>(null)
  const [confirmingAction, setConfirmingAction] = useState<{
    id: string
    title: string
    description: string
    confirmLabel: string
    action: () => Promise<void>
  } | null>(null)

  const [lastResult, setLastResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  // Command Console & Serial Log state
  const [commandInput, setCommandInput] = useState('')
  const [sendingRaw, setSendingRaw] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const saved = localStorage.getItem(`mcs_cmd_logs_${display.id}`)
      if (saved) return JSON.parse(saved)
    } catch {}
    return DEFAULT_LOGS
  })

  // Subview specific state
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [loadingPlaylist, setLoadingPlaylist] = useState(false)
  const [scheduledClearTime, setScheduledClearTime] = useState(display.scheduledClearRepublish || 'Daily-12:00 AM')
  const [clearNextBoot, setClearNextBoot] = useState(display.clearCacheNext || false)
  const [savingSchedule, setSavingSchedule] = useState(false)

  // Persist logs to localStorage
  const addLog = (command: string, response: string) => {
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).replace(/\s/g, '')

    const newEntry: LogEntry = {
      id: 'log-' + Date.now(),
      date: dateStr,
      time: timeStr,
      command,
      response: response || '--',
    }

    setLogs((prev) => {
      const updated = [newEntry, ...prev.slice(0, 49)]
      try {
        localStorage.setItem(`mcs_cmd_logs_${display.id}`, JSON.stringify(updated))
      } catch {}
      return updated
    })
  }

  // Close on ESC
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmingAction) {
          setConfirmingAction(null)
        } else if (currentView === 'command-logs') {
          setCurrentView('send-command')
        } else if (currentView !== 'main') {
          setCurrentView('main')
        } else {
          setOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, currentView, confirmingAction])

  // Load playlist data when Ticker Data view is opened
  useEffect(() => {
    if (currentView === 'ticker-data' && !playlist && !loadingPlaylist) {
      setLoadingPlaylist(true)
      playlistsApi
        .listByDisplay(display.id)
        .then((lists) => {
          if (lists.length > 0) return playlistsApi.get(lists[0].id)
          return null
        })
        .then((p) => setPlaylist(p))
        .catch(() => {})
        .finally(() => setLoadingPlaylist(false))
    }
  }, [currentView, display.id, playlist, loadingPlaylist])

  // Generic command sender
  const executeDeviceCommand = async (cmd: DeviceCommand, label: string) => {
    setPendingCmd(cmd)
    setConfirmingAction(null)
    setLastResult(null)
    try {
      const result = await devicesApi.sendCommand(display.id, cmd)
      const msg = `${label} sent successfully to ${display.name} (IP: ${result.ip || 'online'})`
      setLastResult({ ok: true, message: msg })
      onResult?.(msg, 'success')

      // Record in CommandLine Logs
      const packetSent = cmd === 'power-on' ? '^B00^ACPO^C' :
                         cmd === 'power-off' ? '^B00^ACPF^C' :
                         cmd === 'restart' ? '^B00^ACPR^C' :
                         cmd === 'clear-memory' ? '^B00^ACCM^C' :
                         cmd === 'heartbeat' ? '^B01^ACRA^C' :
                         `^B00^ACST...^ACSD...^C`
      addLog(packetSent, result.response || '--')

      if (cmd === 'power-off') onStatusChange?.(display.id, 'OFFLINE')
      else if (cmd === 'power-on' || cmd === 'restart') onStatusChange?.(display.id, 'ONLINE')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string }
      const errMsg = e.response?.data?.error?.message ?? e.message ?? `${label} failed`
      setLastResult({ ok: false, message: errMsg })
      onResult?.(errMsg, 'error')
      addLog(`[Failed] ${label}`, errMsg)
    } finally {
      setPendingCmd(null)
    }
  }

  // Send raw command typed in Send Command console
  const handleSendRaw = async () => {
    if (!commandInput.trim() || sendingRaw) return
    setSendingRaw(true)
    setLastResult(null)
    const rawCmd = commandInput.trim()
    try {
      const res = await devicesApi.sendRawCommand(display.id, rawCmd)
      const msg = `Command dispatched to ${display.name} (Response: ${res.response || '--'})`
      setLastResult({ ok: true, message: msg })
      onResult?.(msg, 'success')
      addLog(res.packetSent || rawCmd, res.response || '--')
      setCommandInput('')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string }
      const errMsg = e.response?.data?.error?.message ?? e.message ?? 'Command send failed'
      setLastResult({ ok: false, message: errMsg })
      onResult?.(errMsg, 'error')
      addLog(rawCmd, `Error: ${errMsg}`)
    } finally {
      setSendingRaw(false)
    }
  }

  // Copy text to clipboard with feedback
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  // Save clear cache schedule
  const handleSaveSchedule = async () => {
    setSavingSchedule(true)
    try {
      await displaysApi.update(display.id, { tickerOnTime: display.tickerOnTime })
      const msg = `Automated Clear Cache set to ${scheduledClearTime}`
      setLastResult({ ok: true, message: msg })
      onResult?.(msg, 'success')
      setTimeout(() => setCurrentView('main'), 800)
    } catch {
      onResult?.('Failed to save schedule', 'error')
    } finally {
      setSavingSchedule(false)
    }
  }

  // Republish playlist
  const handleRepublish = async () => {
    setPendingCmd('republish')
    setConfirmingAction(null)
    setLastResult(null)
    try {
      await devicesApi.sendCommand(display.id, 'clear-memory')
      const msg = `Republished active playlist content to ${display.name}`
      setLastResult({ ok: true, message: msg })
      addLog('^B01^ACCM^C (Republish)', '--')
      onResult?.(msg, 'success')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string }
      const errMsg = e.response?.data?.error?.message ?? e.message ?? 'Republish failed'
      setLastResult({ ok: false, message: errMsg })
      onResult?.(errMsg, 'error')
      addLog('^B01^ACCM^C (Republish Failed)', errMsg)
    } finally {
      setPendingCmd(null)
    }
  }

  const formatExecutedDate = () => {
    if (display.lastSeenAt) {
      const d = new Date(display.lastSeenAt)
      return (
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ', ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      )
    }
    return 'Sep 16, 12:01 AM'
  }

  const modalMaxWidth = currentView === 'command-logs' ? 'max-w-4xl' : 'max-w-xl'

  return (
    <>
      {/* Trigger Button: Filled blue/cyan circle with white "i" */}
      <button
        onClick={() => {
          setOpen(true)
          setCurrentView('main')
          setConfirmingAction(null)
          setLastResult(null)
        }}
        className="w-5 h-5 rounded-full bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center font-serif font-bold text-xs shadow-sm transition hover:scale-105 active:scale-95"
        title="Display Info & Settings"
        aria-label="Display Info & Settings"
      >
        i
      </button>

      {/* Centered Modal Window */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
          onClick={() => {
            if (!confirmingAction) setOpen(false)
          }}
        >
          <div
            className={`bg-white rounded-2xl shadow-2xl border border-gray-300 w-full ${modalMaxWidth} overflow-hidden animate-in zoom-in-95 duration-150 transition-all`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Modal Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900 tracking-tight">
                Display Info & Settings
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Notification Banner */}
            {lastResult && (
              <div
                className={`mx-6 mt-3 px-3.5 py-2 rounded-lg text-xs flex items-center gap-2 border ${
                  lastResult.ok
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {lastResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                )}
                <span className="flex-1 truncate">{lastResult.message}</span>
                <button
                  onClick={() => setLastResult(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 ml-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Confirmation Banner */}
            {confirmingAction && (
              <div className="mx-6 mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs font-bold">{confirmingAction.title}</div>
                    <div className="text-xs text-amber-800 mt-0.5">{confirmingAction.description}</div>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => void confirmingAction.action()}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                      >
                        {confirmingAction.confirmLabel}
                      </button>
                      <button
                        onClick={() => setConfirmingAction(null)}
                        className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-xs font-medium transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===================== SUB-VIEW: SEND COMMAND (Image 1) ===================== */}
            {currentView === 'send-command' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setCurrentView('main')}
                    className="p-1 -ml-1 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                    title="Back to Controls"
                  >
                    <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
                  </button>
                  <h4 className="text-base font-semibold text-gray-900">Send Command</h4>
                  <button
                    onClick={() => setCurrentView('command-logs')}
                    className="p-1 -mr-1 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                    title="View CommandLine Logs & Serial Responses"
                  >
                    <List className="w-6 h-6 stroke-[2.5]" />
                  </button>
                </div>

                <div className="w-full bg-black rounded-md p-4 min-h-[220px] sm:min-h-[240px] flex flex-col shadow-inner">
                  <textarea
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    placeholder="Enter commands"
                    rows={7}
                    className="w-full bg-transparent text-white font-mono text-xs sm:text-sm resize-none focus:outline-none placeholder-gray-400 leading-relaxed"
                    autoFocus
                  />
                </div>

                <div className="flex justify-center mt-5">
                  <button
                    onClick={() => void handleSendRaw()}
                    disabled={!commandInput.trim() || sendingRaw}
                    className="px-10 py-2 rounded-full text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-xs flex items-center gap-1.5"
                  >
                    {sendingRaw && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Send
                  </button>
                </div>
              </div>
            )}

            {/* ===================== SUB-VIEW: COMMANDLINE LOGS (Image 2) ===================== */}
            {currentView === 'command-logs' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setCurrentView('send-command')}
                    className="p-1 -ml-1 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                    title="Back to Send Command"
                  >
                    <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
                  </button>
                  <h4 className="text-base font-semibold text-gray-900">CommandLine Logs</h4>
                  <div className="w-6" />
                </div>

                <div className="border border-gray-200 rounded-md overflow-hidden bg-white shadow-xs">
                  <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                    <table className="w-full text-xs text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="bg-[#538fae] text-white">
                          <th className="py-2.5 px-4 font-semibold w-28 text-left border-r border-[#437894]">Date</th>
                          <th className="py-2.5 px-4 font-semibold w-28 text-left border-r border-[#437894]">Time</th>
                          <th className="py-2.5 px-4 font-semibold text-left border-r border-[#437894]">Command Send</th>
                          <th className="py-2.5 px-4 font-semibold w-48 text-left">Response</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {logs.map((row, index) => {
                          const isEven = index % 2 === 0
                          const cmdCopyKey = `cmd-${row.id}`
                          const resCopyKey = `res-${row.id}`
                          const isCmdCopied = copiedId === cmdCopyKey
                          const isResCopied = copiedId === resCopyKey

                          return (
                            <tr
                              key={row.id}
                              className={isEven ? 'bg-white hover:bg-sky-50/40' : 'bg-gray-50/70 hover:bg-sky-50/40'}
                            >
                              <td className="py-2.5 px-4 text-gray-800 border-r border-gray-200 whitespace-nowrap">
                                {row.date}
                              </td>
                              <td className="py-2.5 px-4 text-gray-800 border-r border-gray-200 whitespace-nowrap">
                                {row.time}
                              </td>
                              <td className="py-2.5 px-4 border-r border-gray-200">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-mono text-[11px] text-gray-900 overflow-x-auto whitespace-nowrap max-w-xs sm:max-w-md pr-2 scrollbar-thin">
                                    {row.command}
                                  </div>
                                  <button
                                    onClick={() => handleCopy(row.command, cmdCopyKey)}
                                    className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition flex-shrink-0"
                                    title="Copy command to clipboard"
                                  >
                                    {isCmdCopied ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-[11px] text-gray-900 truncate">
                                    {row.response}
                                  </span>
                                  <button
                                    onClick={() => handleCopy(row.response, resCopyKey)}
                                    className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition flex-shrink-0"
                                    title="Copy response to clipboard"
                                  >
                                    {isResCopied ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
                  <span>Showing {logs.length} logged serial transactions</span>
                  <button
                    onClick={() => {
                      setLogs([])
                      localStorage.removeItem(`mcs_cmd_logs_${display.id}`)
                    }}
                    className="hover:text-red-600 transition"
                  >
                    Clear History
                  </button>
                </div>
              </div>
            )}

            {/* ===================== VIEW 1: MAIN 11-BUTTON GRID ===================== */}
            {currentView === 'main' && (
              <div className="p-6">
                <div className="flex flex-col gap-4 sm:gap-5">
                  {/* Row 1: Power On, Power Off, Restart, Clear Memory */}
                  <div className="grid grid-cols-4 gap-3 sm:gap-4">
                    {/* 1. Power On */}
                    <button
                      onClick={() => void executeDeviceCommand('power-on', 'Power On')}
                      disabled={!!pendingCmd}
                      className="h-24 sm:h-26 rounded-2xl border-2 border-gray-400 bg-white hover:border-gray-700 hover:bg-gray-50 active:scale-95 transition flex flex-col items-center justify-center p-2 text-center group disabled:opacity-50"
                    >
                      {pendingCmd === 'power-on' ? (
                        <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
                      ) : (
                        <Power className="w-7 h-7 text-gray-800 group-hover:text-emerald-600 transition" />
                      )}
                      <span className="text-xs font-semibold text-gray-800 mt-2 leading-tight">
                        Power On
                      </span>
                    </button>

                    {/* 2. Power Off */}
                    <button
                      onClick={() =>
                        setConfirmingAction({
                          id: 'power-off',
                          title: 'Confirm Power Off',
                          description: `Are you sure you want to turn off ${display.name}? Display will go offline.`,
                          confirmLabel: 'Yes, Power Off',
                          action: () => executeDeviceCommand('power-off', 'Power Off'),
                        })
                      }
                      disabled={!!pendingCmd}
                      className="h-24 sm:h-26 rounded-2xl border-2 border-gray-400 bg-white hover:border-gray-700 hover:bg-gray-50 active:scale-95 transition flex flex-col items-center justify-center p-2 text-center group disabled:opacity-50"
                    >
                      {pendingCmd === 'power-off' ? (
                        <Loader2 className="w-7 h-7 text-amber-600 animate-spin" />
                      ) : (
                        <Power className="w-7 h-7 text-gray-800 group-hover:text-amber-600 transition" />
                      )}
                      <span className="text-xs font-semibold text-gray-800 mt-2 leading-tight">
                        Power Off
                      </span>
                    </button>

                    {/* 3. Restart */}
                    <button
                      onClick={() =>
                        setConfirmingAction({
                          id: 'restart',
                          title: 'Confirm Restart',
                          description: `This will reboot the controller for ${display.name}.`,
                          confirmLabel: 'Yes, Restart',
                          action: () => executeDeviceCommand('restart', 'Restart'),
                        })
                      }
                      disabled={!!pendingCmd}
                      className="h-24 sm:h-26 rounded-2xl border-2 border-gray-400 bg-white hover:border-gray-700 hover:bg-gray-50 active:scale-95 transition flex flex-col items-center justify-center p-2 text-center group disabled:opacity-50"
                    >
                      {pendingCmd === 'restart' ? (
                        <Loader2 className="w-7 h-7 text-sky-600 animate-spin" />
                      ) : (
                        <RotateCw className="w-7 h-7 text-gray-800 group-hover:text-sky-600 transition" />
                      )}
                      <span className="text-xs font-semibold text-gray-800 mt-2 leading-tight">
                        Restart
                      </span>
                    </button>

                    {/* 4. Clear Memory */}
                    <button
                      onClick={() =>
                        setConfirmingAction({
                          id: 'clear-memory',
                          title: 'Confirm Clear Memory',
                          description: `This will wipe all active graphics and memory from ${display.name}.`,
                          confirmLabel: 'Yes, Clear Memory',
                          action: () => executeDeviceCommand('clear-memory', 'Clear Memory'),
                        })
                      }
                      disabled={!!pendingCmd}
                      className="h-24 sm:h-26 rounded-2xl border-2 border-gray-400 bg-white hover:border-gray-700 hover:bg-gray-50 active:scale-95 transition flex flex-col items-center justify-center p-2 text-center group disabled:opacity-50"
                    >
                      {pendingCmd === 'clear-memory' ? (
                        <Loader2 className="w-7 h-7 text-rose-600 animate-spin" />
                      ) : (
                        <Trash2 className="w-7 h-7 text-gray-800 group-hover:text-rose-600 transition" />
                      )}
                      <span className="text-xs font-semibold text-gray-800 mt-2 leading-tight">
                        Clear Memory
                      </span>
                    </button>
                  </div>

                  {/* Row 2: Ticker Data, Queue Status, Install Font, Network */}
                  <div className="grid grid-cols-4 gap-3 sm:gap-4">
                    {/* 5. Ticker Data */}
                    <button
                      onClick={() => setCurrentView('ticker-data')}
                      className="h-24 sm:h-26 rounded-2xl border-2 border-gray-400 bg-white hover:border-gray-700 hover:bg-gray-50 active:scale-95 transition flex flex-col items-center justify-center p-2 text-center group"
                    >
                      <AlignLeft className="w-7 h-7 text-gray-800 group-hover:text-brand-600 transition" />
                      <span className="text-xs font-semibold text-gray-800 mt-2 leading-tight">
                        Ticker Data
                      </span>
                    </button>

                    {/* 6. Queue Status */}
                    <button
                      onClick={() => setCurrentView('queue-status')}
                      className="h-24 sm:h-26 rounded-2xl border-2 border-gray-400 bg-white hover:border-gray-700 hover:bg-gray-50 active:scale-95 transition flex flex-col items-center justify-center p-2 text-center group"
                    >
                      <div className="w-7 h-7 rounded-full bg-gray-900 group-hover:bg-brand-600 text-white flex items-center justify-center font-serif font-bold text-sm transition">
                        i
                      </div>
                      <span className="text-xs font-semibold text-gray-800 mt-2 leading-tight">
                        Queue Status
                      </span>
                    </button>

                    {/* 7. Install Font */}
                    <button
                      onClick={() => setCurrentView('install-font')}
                      className="h-24 sm:h-26 rounded-2xl border-2 border-gray-400 bg-white hover:border-gray-700 hover:bg-gray-50 active:scale-95 transition flex flex-col items-center justify-center p-2 text-center group"
                    >
                      <Download className="w-7 h-7 text-gray-800 group-hover:text-violet-600 transition" />
                      <span className="text-xs font-semibold text-gray-800 mt-2 leading-tight">
                        Install Font
                      </span>
                    </button>

                    {/* 8. Network */}
                    <button
                      onClick={() => setCurrentView('network')}
                      className="h-24 sm:h-26 rounded-2xl border-2 border-gray-400 bg-white hover:border-gray-700 hover:bg-gray-50 active:scale-95 transition flex flex-col items-center justify-center p-2 text-center group"
                    >
                      <Wifi className="w-7 h-7 text-gray-800 group-hover:text-sky-600 transition" />
                      <span className="text-xs font-semibold text-gray-800 mt-2 leading-tight">
                        Network
                      </span>
                    </button>
                  </div>

                  {/* Row 3: Republish, Automated Clear Cache, Commands */}
                  <div className="grid grid-cols-4 gap-3 sm:gap-4">
                    {/* 9. Republish (Col 1) */}
                    <button
                      onClick={() =>
                        setConfirmingAction({
                          id: 'republish',
                          title: 'Confirm Republish',
                          description: `Clear cache and republish current playlist items to ${display.name}?`,
                          confirmLabel: 'Yes, Republish',
                          action: handleRepublish,
                        })
                      }
                      disabled={!!pendingCmd}
                      className="h-24 sm:h-26 rounded-2xl border-2 border-gray-400 bg-white hover:border-gray-700 hover:bg-gray-50 active:scale-95 transition flex flex-col items-center justify-center p-2 text-center group disabled:opacity-50"
                    >
                      {pendingCmd === 'republish' ? (
                        <Loader2 className="w-7 h-7 text-brand-600 animate-spin" />
                      ) : (
                        <RotateCcw className="w-7 h-7 text-gray-800 group-hover:text-brand-600 transition" />
                      )}
                      <span className="text-xs font-semibold text-gray-800 mt-2 leading-tight">
                        Republish
                      </span>
                    </button>

                    {/* 10. Automated Clear Cache (Centered spanning Col 2 & 3) */}
                    <div className="col-span-2 flex justify-center">
                      <button
                        onClick={() => setCurrentView('automated-cache')}
                        className="w-full max-w-[130px] sm:max-w-[140px] h-24 sm:h-26 rounded-2xl border-2 border-gray-400 bg-white hover:border-gray-700 hover:bg-gray-50 active:scale-95 transition flex flex-col items-center justify-center p-2 text-center group"
                      >
                        <Calendar className="w-7 h-7 text-gray-800 group-hover:text-indigo-600 transition" />
                        <span className="text-xs font-semibold text-gray-800 mt-1.5 leading-tight">
                          Automated<br />Clear Cache
                        </span>
                      </button>
                    </div>

                    {/* 11. Commands (Col 4 - Opens Send Command view from Image 1) */}
                    <button
                      onClick={() => setCurrentView('send-command')}
                      className="h-24 sm:h-26 rounded-2xl border-2 border-gray-400 bg-white hover:border-gray-700 hover:bg-gray-50 active:scale-95 transition flex flex-col items-center justify-center p-2 text-center group"
                      title="Open Command Console (Send Command / CommandLine Logs)"
                    >
                      <Menu className="w-7 h-7 text-gray-800 group-hover:text-brand-600 transition" />
                      <span className="text-xs font-semibold text-gray-800 mt-2 leading-tight">
                        Commands
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ===================== VIEW 2: TICKER DATA ===================== */}
            {currentView === 'ticker-data' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentView('main')}
                      className="p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition"
                      title="Back to Controls"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">Current Ticker Playlist</h4>
                      <p className="text-xs text-gray-500">Active content broadcasting on this display</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setOpen(false)
                      navigate(`/displays/${display.id}`)
                    }}
                    className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                  >
                    Full Editor <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                {loadingPlaylist ? (
                  <div className="py-12 flex flex-col items-center justify-center text-gray-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin mb-2 text-brand-600" />
                    Loading playlist items...
                  </div>
                ) : playlist && playlist.items && playlist.items.length > 0 ? (
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-60 overflow-y-auto">
                    {playlist.items.map((item, idx) => (
                      <div key={item.id} className="p-3 flex items-center justify-between text-xs hover:bg-gray-50">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 font-mono text-[10px] flex items-center justify-center font-bold">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-semibold text-gray-800">{item.name || item.itemType}</div>
                            <div className="text-[11px] text-gray-400 font-mono truncate max-w-xs">
                              {item.content || (item.config ? JSON.stringify(item.config) : 'No content')}
                            </div>
                          </div>
                        </div>
                        <span className="bg-brand-50 text-brand-700 font-semibold px-2 py-0.5 rounded text-[10px] border border-brand-200">
                          {item.itemType}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-gray-400 text-xs bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    No playlist items found. Click "Full Editor" to add messages or feeds.
                  </div>
                )}
              </div>
            )}

            {/* ===================== VIEW 3: QUEUE STATUS ===================== */}
            {currentView === 'queue-status' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentView('main')}
                    className="p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition"
                    title="Back to Controls"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Device Queue & Portal Status</h4>
                    <p className="text-xs text-gray-500">Live synchronization with xPico 240 TCP Tunnel</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <span className="text-gray-400 block text-[11px]">Connection State</span>
                    <span
                      className={`font-bold mt-1 inline-flex items-center gap-1.5 ${
                        display.status === 'ONLINE' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          display.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                      />
                      {display.status}
                    </span>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <span className="text-gray-400 block text-[11px]">TCP Portal Port</span>
                    <span className="font-mono font-bold text-gray-800 mt-1 block">5000 (Active)</span>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <span className="text-gray-400 block text-[11px]">MAC Address</span>
                    <span className="font-mono font-bold text-gray-800 mt-1 block">{display.macAddress}</span>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <span className="text-gray-400 block text-[11px]">Queue Backlog</span>
                    <span className="font-bold text-gray-800 mt-1 block">0 items (In Sync)</span>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => void executeDeviceCommand('heartbeat', 'Heartbeat Ping')}
                    disabled={!!pendingCmd}
                    className="inline-flex items-center gap-2 bg-gray-900 hover:bg-black text-white text-xs font-semibold px-4 py-2 rounded-xl transition disabled:opacity-50"
                  >
                    {pendingCmd === 'heartbeat' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                    Test Heartbeat (RA)
                  </button>
                </div>
              </div>
            )}

            {/* ===================== VIEW 4: INSTALL FONT ===================== */}
            {currentView === 'install-font' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentView('main')}
                    className="p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition"
                    title="Back to Controls"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">MCS Font Management</h4>
                    <p className="text-xs text-gray-500">Bitmap fonts stored on display EEPROM</p>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 text-xs">
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-800">SS16.lmf (16px System)</div>
                      <div className="text-[11px] text-gray-400 font-mono">Standard font for 16px & 32px tickers</div>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">
                      Installed
                    </span>
                  </div>

                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-800">SS32.lmf (32px Large)</div>
                      <div className="text-[11px] text-gray-400 font-mono">Large font for double-height headers</div>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">
                      Installed
                    </span>
                  </div>
                </div>

                <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-xs text-sky-800">
                  After uploading new font files, send <code className="font-mono font-bold">WFadjustmcsfont=1</code> to rebuild font index.
                </div>

                <button
                  onClick={() => {
                    addLog('^B00^ACWFadjustmcsfont=1^C', '--')
                    onResult?.('Font cache refresh command pushed', 'success')
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold py-2.5 rounded-xl transition"
                >
                  <Download className="w-4 h-4" /> Rebuild Font Cache (WFadjustmcsfont=1)
                </button>
              </div>
            )}

            {/* ===================== VIEW 5: NETWORK ===================== */}
            {currentView === 'network' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentView('main')}
                    className="p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition"
                    title="Back to Controls"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Network & Protocol Parameters</h4>
                    <p className="text-xs text-gray-500">Hardware address and tunnel routing</p>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">MAC Address</span>
                    <span className="font-mono font-bold text-gray-900">{display.macAddress}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Hardware Model</span>
                    <span className="font-semibold text-gray-900">Lantronix xPico 240</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Target Address</span>
                    <span className="font-mono text-gray-900">01 (or 00 broadcast)</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Timezone</span>
                    <span className="font-semibold text-gray-900">
                      {display.timezone} {display.timezoneRegion ? `(${display.timezoneRegion})` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-500">Operating Hours</span>
                    <span className="font-mono text-gray-900">
                      {display.tickerOnTime} - {display.tickerOffTime}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ===================== VIEW 6: AUTOMATED CLEAR CACHE ===================== */}
            {currentView === 'automated-cache' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentView('main')}
                    className="p-1 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition"
                    title="Back to Controls"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Automated Clear Cache Schedule</h4>
                    <p className="text-xs text-gray-500">Prevent stale ticker memory and reboot display cleanly</p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Clear Cache Schedule</label>
                    <select
                      value={scheduledClearTime}
                      onChange={(e) => setScheduledClearTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white font-medium focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="Daily-12:00 AM">Daily-12:00 AM (Midnight default)</option>
                      <option value="Daily-02:00 AM">Daily-02:00 AM</option>
                      <option value="Daily-04:00 AM">Daily-04:00 AM</option>
                      <option value="Every 12 Hours">Every 12 Hours</option>
                      <option value="Disabled">Disabled</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="clearNextBoot"
                      checked={clearNextBoot}
                      onChange={(e) => setClearNextBoot(e.target.checked)}
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="clearNextBoot" className="font-medium text-gray-700 cursor-pointer">
                      Clear cache on next device reboot
                    </label>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-xl text-gray-500 text-[11px] leading-relaxed">
                    Automatically issues the MCS <code className="font-mono text-gray-700 font-bold">^B00^ACCM^C</code> command at the scheduled hour, followed by re-synchronization of active playlists.
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setCurrentView('main')}
                    className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleSaveSchedule()}
                    disabled={savingSchedule}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-xs transition disabled:opacity-50"
                  >
                    {savingSchedule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save Schedule
                  </button>
                </div>
              </div>
            )}

            {/* Footer Bar matching screenshot */}
            <div className="border-t border-gray-200 bg-gray-50/70 px-6 py-3.5 flex items-center justify-between text-xs text-gray-700 font-medium">
              <div>
                Clear Cache: <span className="font-semibold text-gray-900">{scheduledClearTime}</span>
              </div>
              <div>
                Last Executed: <span className="font-semibold text-gray-900">{formatExecutedDate()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export const DeviceControlModal = DeviceControlPopover
