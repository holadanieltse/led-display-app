// =============================================================================
// MCS Protocol v3.1 — Packet Builders & Command Sender
// =============================================================================
//
// WHAT THIS FILE DOES:
//   Translates human-friendly commands ("power on", "send this message") into
//   the MCS control-code packets that LED ticker hardware understands, and
//   pushes those packets through the Device Portal TCP connection.
//
// THE MCS PROTOCOL (see MCS_Protocol_Engineer_Reference_v2.md):
//
//   Envelope:  ^B{addr}^A{cmd}{data}[^D{4-hex-checksum}]^C
//   Chaining:  repeat ^A{cmd}{data} inside one ^B...^C (ONE transaction, ONE WT)
//
//   Command letters:
//     A = write text file (restarts display)
//     B = write variable file (no restart) — documented as "^ACB{label}{content}"
//     C = special function, followed by a 2-letter sub-code (SM, ST, PO, FM, WF...)
//     D = write text, no restart
//
//   Key sub-codes used here:
//     SM = set memory (label + type + hex size) — only affects the NEXT write
//     ST = set time (HHMMSS)      SD = set date (MMDDYYYYX, X = weekday 0-6)
//     CM = clear memory           PO/PF = power on/off      PR = restart
//     RA = read address (also used as a "is the sign ready?" ping)
//     FM/FW = file mem allocate / file write (Base64)
//     WF = RISE-vendor config (brightness=0-100, adjustmcsfont=1, ...)
//
// ⚠️ NO COMMAND QUEUEING:
//   The sign controller has ZERO command buffer. It processes one packet at a
//   time. We must send one packet, wait for the `ok` response (or the per
//   command Wait Time), and only then send the next. deviceServer.ts enforces
//   this with a per-device lock so overlapping writes are rejected.
//
// A MESSAGE-TO-TICKER WRITE:
//   A plain text message is written as a text file (label "A"), per §9/§10:
//     ^B01^ACSMAT{size}^D{chk}^AAA{content}^D{chk}^C
//       └ SM: label "A", type T, size  └ write text to label "A"
//
// WHERE TO LOOK NEXT:
//   - deviceServer.ts — the TCP server that holds the actual sockets (lock + timeout)
//   - rssService.ts   — same write flow, but for RSS content
//   - MCS_Protocol_Engineer_Reference_v2.md — the protocol reference
// =============================================================================

import { sendPacketToMac, getActiveConnection } from './deviceServer'

// ==================== Config ====================

const MCS_DEVICE_ADDRESS = process.env.MCS_DEVICE_ADDRESS || '01'
const MCS_TCP_TIMEOUT_MS = parseInt(process.env.MCS_TCP_TIMEOUT_MS || '10000', 10)

/**
 * Wait Times (WT) per command category, in seconds — see reference §"Wait Times
 * by Command Type". After a write the sign needs this long to flush to flash
 * before it can accept the next command. Because there is no command queue, we
 * hold the device lock for at least this long after each write.
 */
export const WAIT_TIME_SEC = {
  system: 10, // PO / PF / PR / CM
  fontUpload: 30, // FM/FW of .lmf + font cache rebuild
  config: 6, // WF / CCF flash writes
  variableWrite: 3, // SM + B
  imageUpload: 3, // FM/FW of .png
  playlistWrite: 4, // SM + A (full render pipeline rebuild + restart)
} as const

// ==================== Low-Level Envelope ====================

const STX = '^B' // start of transmission (addresses follow)
const SOH = '^A' // start of command (reused to chain commands)
const EOT = '^D' // precedes the checksum
const ETX = String.fromCharCode(3) // ^C — end of transmission

/**
 * Sum-mode checksum: sum of all bytes of the segment from ^A through ^D
 * (inclusive), masked to 16 bits, formatted as 4 uppercase hex digits.
 * See reference §6 — "Sum mode (default, used by RISE)".
 */
export function checksumSum(segmentWithEot: string): string {
  let sum = 0
  for (const byte of Buffer.from(segmentWithEot, 'ascii')) sum += byte
  return (sum & 0xffff).toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Build a single `^A{cmd}{data}` command segment, with the trailing `^D{chk}`
 * checksum appended (per command, not per packet — see reference §6).
 */
function segment(cmd: string, data: string = '', withChecksum = true): string {
  const body = `${SOH}${cmd}${data}`
  if (!withChecksum) return body
  const withEot = `${body}${EOT}`
  return `${withEot}${checksumSum(withEot)}`
}

/**
 * Build a complete packet: ^B{addr}{chained segments}^C
 * Multiple `^A...` segments are processed sequentially and count as ONE
 * transaction (one WT total).
 */
function buildPacket(address: string, segments: string[]): string {
  return `${STX}${address}${segments.join('')}${ETX}`
}

// ==================== System Commands ====================

/** Power On — ^B00^ACPO^C (broadcast address 00) */
export function buildPowerOn(): string {
  return buildPacket('00', [segment('C', 'PO')])
}

/** Power Off — ^B00^ACPF^C */
export function buildPowerOff(): string {
  return buildPacket('00', [segment('C', 'PF')])
}

/**
 * Restart Device — ^B00^ACPR{data}^C
 * data: '1' = skip startup screen, '0' (default) = show startup screen.
 */
export function buildRestart(skipStartupScreen = false): string {
  return buildPacket('00', [segment('C', `PR${skipStartupScreen ? '1' : '0'}`)])
}

/** Clear All Stored Content — ^B00^ACCM^C */
export function buildClearMemory(): string {
  return buildPacket('00', [segment('C', 'CM')])
}

/**
 * Set Date & Time — ^B00^ACST{HHmmss}^ACSD{MMddYYYY}{weekday}^C
 * SD takes `MMDDYYYYX` where X is the weekday 0-6 (see reference §3.1).
 */
export function buildSyncTime(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')

  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yyyy = String(date.getFullYear())
  const weekday = String(date.getDay()) // 0 = Sunday .. 6 = Saturday

  return buildPacket('00', [
    segment('C', `ST${hh}${mm}${ss}`),
    segment('C', `SD${mo}${dd}${yyyy}${weekday}`),
  ])
}

/** Heartbeat / "is the sign ready?" ping — ^B01^ACRA^C */
export function buildHeartbeat(): string {
  return buildPacket(MCS_DEVICE_ADDRESS, [segment('C', 'RA')])
}

// ==================== RISE-Specific Config (WF) ====================

/** Set brightness (RISE `WF`, percentage 0–100) — ^B{addr}^ACWFbrightness={n}^C */
export function buildSetBrightness(percent: number, address = MCS_DEVICE_ADDRESS): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  return buildPacket(address, [segment('C', `WFbrightness=${clamped}`)])
}

/** Refresh font cache after uploading .lmf files — ^B00^ACWFadjustmcsfont=1^C */
export function buildAdjustFont(): string {
  return buildPacket('00', [segment('C', 'WFadjustmcsfont=1')])
}

// ==================== File Upload (FM + FW) ====================

/** Allocate + write a file in one chained packet. Size is auto-computed (hex). */
export function buildFileUploadPacket(
  filename: string,
  data: Buffer,
  address = MCS_DEVICE_ADDRESS,
): string {
  const sizeHex = data.length.toString(16).toUpperCase()
  const base64 = data.toString('base64')
  return buildPacket(address, [
    segment('C', `FM${filename}=${sizeHex}`),
    segment('C', `FW${filename}=${base64}`),
  ])
}

// ==================== Memory / Write (SM + A / B) ====================

export type FileType = 'T' | 'V' | 'N' | 'S' // Text / Variable / Text-no-restart / Script

/**
 * Write a text file (label + content) as one chained packet.
 *   ^B{addr}^ACSM{label}{T}{hex_size}^D{chk}^A{label}A{content}^D{chk}^C
 *
 * Reference §9 (playlist write) shows literally:
 *   ^B01^ACSMAT237^AAA^E$SCL1$...
 * i.e. SM sets label "A"/type T, then the write segment is SOH + 'A' + label.
 */
export function buildTextWritePacket(
  label: string,
  content: string,
  address = MCS_DEVICE_ADDRESS,
): string {
  const sizeHex = byteLength(content).toString(16).toUpperCase()
  return buildPacket(address, [
    segment('C', `SM${label}T${sizeHex}`),
    segment('A', `${label}${content}`),
  ])
}

/**
 * Write a variable file (label + content) as one chained packet.
 *   ^B{addr}^ACSM{label}V{hex_size}^D{chk}^ACB{label}{content}^D{chk}^C
 *
 * Reference §7 / §9 show the write segment literally as `^ACB{label}{content}`,
 * e.g. `^B01^ACB$F00$^S$ADBE0.png$...^C`.
 */
export function buildVariableWritePacket(
  label: string,
  content: string,
  address = MCS_DEVICE_ADDRESS,
): string {
  const sizeHex = byteLength(content).toString(16).toUpperCase()
  return buildPacket(address, [
    segment('C', `SM${label}V${sizeHex}`),
    segment('C', `B${label}${content}`),
  ])
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'ascii')
}

// ==================== High-Level Device Commands ====================

export type DeviceCommand =
  | 'power-on'
  | 'power-off'
  | 'restart'
  | 'clear-memory'
  | 'sync-time'
  | 'heartbeat'

/** WT (seconds) each system command needs before another command may be sent. */
const COMMAND_WAIT_SEC: Record<DeviceCommand, number> = {
  'power-on': WAIT_TIME_SEC.system,
  'power-off': WAIT_TIME_SEC.system,
  restart: WAIT_TIME_SEC.system,
  'clear-memory': WAIT_TIME_SEC.system,
  'sync-time': WAIT_TIME_SEC.config,
  heartbeat: 1,
}

const COMMAND_BUILDERS: Record<DeviceCommand, () => string> = {
  'power-on': buildPowerOn,
  'power-off': buildPowerOff,
  restart: () => buildRestart(false),
  'clear-memory': buildClearMemory,
  'sync-time': () => buildSyncTime(new Date()),
  heartbeat: buildHeartbeat,
}

export const DEVICE_COMMAND_LABELS: Record<DeviceCommand, string> = {
  'power-on': 'Power On',
  'power-off': 'Power Off',
  restart: 'Restart',
  'clear-memory': 'Clear Memory',
  'sync-time': 'Sync Date & Time',
  heartbeat: 'Heartbeat',
}

/**
 * Error prefixes the sign reports back (reference §4). If any appear in a
 * response we must stop — sending more commands on top of an error state can
 * leave the sign needing a full `CM` reset.
 */
const DEVICE_ERRORS = [
  'unknown command code',
  'bad checksum',
  'invalid file label',
  'invalid file size',
  'not enough memory',
  'file does not exist',
  'file out of allocated size',
  'invalid hexadecimal number',
  'invalid time format',
  'invalid date format',
  'invalid address',
  'bad command parameters',
]

/** Throw if a device response indicates an MCS error (reference §4). */
export function assertNoDeviceError(response: string, context: string): void {
  const lower = response.toLowerCase()
  const hit = DEVICE_ERRORS.find((e) => lower.includes(e))
  if (hit) {
    throw new Error(`Device reported "${hit}" while ${context}. Stop — check the device state before retrying.`)
  }
}

/**
 * Send a device command to a display by its MAC address, then respect the
 * command's Wait Time before returning (no command queueing — reference §1).
 *
 * @returns ip — the remote IP the device connected from (for logging only)
 */
export async function sendDeviceCommand(
  macAddress: string,
  command: DeviceCommand,
): Promise<{ success: boolean; ip: string | null; response: string; command: DeviceCommand }> {
  const builder = COMMAND_BUILDERS[command]
  if (!builder) {
    throw new Error(`Unknown device command: ${command}`)
  }

  // Verify the device has an active portal connection
  const conn = getActiveConnection(macAddress)
  if (!conn) {
    throw new Error(
      `Device ${macAddress} is not online. ` +
      'The xPico 240 must connect to the Device Portal and complete the MAC handshake before commands can be issued.',
    )
  }

  const packet = builder()
  const waitSec = COMMAND_WAIT_SEC[command]
  const response = await sendPacketToMac(macAddress, packet, MCS_TCP_TIMEOUT_MS, waitSec * 1000)
  assertNoDeviceError(response, `running "${command}"`)

  return {
    success: true,
    ip: conn.remoteIp,
    response,
    command,
  }
}

// ==================== Message Content Encoding ====================

/**
 * Config for encoding a text message into MCS content.
 */
export interface MessageMcsConfig {
  font: string // 'Standard' | 'Bold' | 'Condensed' | 'Serif'
  fontSize: number // pixel size (7, 8, 16, 32, 64)
  color: string // hex like '#FFFFFF'
}

/** Map font size to closest MCS SS code (SS7, SS8, SS16, SS32, SS64). */
function fontToSsCode(fontSize: number): string {
  const sizes = [7, 8, 16, 32, 64]
  const closest = sizes.reduce((prev, curr) =>
    Math.abs(curr - fontSize) < Math.abs(prev - fontSize) ? curr : prev,
  )
  return `SS${closest}`
}

/** Convert hex color to MCS color code: ^O$F:#FFFFFF$ */
function mcsColor(hex: string): string {
  return `^O$F:${hex}$`
}

/**
 * Build the MCS content string for a plain text message.
 * Example output: ^E$SCL1$^F$SS16$^O$F:#FFFFFF$Hello World!
 */
export function buildMessageMcsContent(text: string, config: MessageMcsConfig): string {
  const ssCode = fontToSsCode(config.fontSize)
  const colorCode = mcsColor(config.color)

  return [
    `^E$SCL1$`, // scroll-left effect
    `^F$${ssCode}$`, // set font size
    colorCode, // set foreground color
    text, // the actual message text
  ].join('')
}

/** Text file label used by the message write. */
const MESSAGE_LABEL = 'A'

/**
 * Build a text-file write packet for a plain text message (the doc's write
 * flow). Writing text file "A" makes the message the device's displayed content
 * and triggers a full restart.
 */
export function buildMessageMcsPacket(
  text: string,
  config: MessageMcsConfig,
  address: string = MCS_DEVICE_ADDRESS,
): string {
  const content = buildMessageMcsContent(text, config)
  return buildTextWritePacket(MESSAGE_LABEL, content, address)
}

/**
 * Build a variable write packet for a plain text message (no display restart).
 * The variable must be referenced by the active playlist (`^N$F00$`) to be
 * visible. Useful for live updates without a restart.
 */
export function buildMessageVariablePacket(
  text: string,
  config: MessageMcsConfig,
  label = '$F00$',
  address: string = MCS_DEVICE_ADDRESS,
): string {
  const content = buildMessageMcsContent(text, config)
  return buildVariableWritePacket(label, content, address)
}

/** WT to hold the device lock after writing a message. */
export const MESSAGE_WRITE_WAIT_SEC = WAIT_TIME_SEC.playlistWrite
