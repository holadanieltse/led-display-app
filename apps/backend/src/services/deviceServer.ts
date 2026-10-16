// =============================================================================
// Device Portal TCP Server
// =============================================================================
//
// WHAT THIS FILE DOES:
//   This is the "reception desk" for physical LED ticker devices. It runs a
//   raw TCP server on port 5000 that xPico 240 network adapters connect to.
//
// WHY DEVICES CONNECT IN (instead of backend reaching out):
//   LED tickers are often behind NAT, firewalls, or on cellular networks.
//   The backend can't reliably ARP-resolve or open connections to them.
//   Instead, each xPico 240 is configured to connect OUT to this server on
//   startup — just like a browser connects to a website. This punches through
//   NAT/firewalls automatically. Once connected, the socket stays open and
//   the backend can push MCS protocol commands through it at any time.
//
// THE HANDSHAKE FLOW:
//   1. xPico 240 boots → opens TCP connection to backend:5000
//   2. xPico sends its MAC address as the very first message (e.g. "0080A3EE051F")
//   3. Backend normalizes the MAC, stores the socket in a Map<MAC, socket>
//   4. Backend marks the display as ONLINE in PostgreSQL
//   5. The socket stays open — backend can now send MCS commands through it
//
// CONNECTION LIFECYCLE:
//   - connect → handshake → registry → commands → disconnect → DB update
//   - If no valid MAC arrives within 15s, the connection is killed (handshake timeout)
//   - When the socket closes (device reboot, network loss), the display goes OFFLINE
//
// KEY CONCEPT — The Connection Registry:
//   `connections` is a simple in-memory Map<normalizedMAC, DeviceConnection>.
//   This is the bridge between the REST API and the TCP world:
//     - REST handler receives "send command to display X"
//     - Looks up X's MAC address in PostgreSQL
//     - Checks `connections` Map for an active socket
//     - If found → writes MCS packet to that socket
//     - If not found → returns "device is offline" error
//
// TRADE-OFFS:
//   - In-memory registry means connections are lost on server restart (acceptable
//     — devices reconnect automatically within seconds)
//   - No authentication on the TCP port — any device can connect. For production,
//     add a pre-shared key in the handshake or use TLS mutual auth.
// =============================================================================

import net, { type Socket } from 'net'
import type { Server } from 'net'
import { prisma } from '../utils/prisma'

// ==================== Config ====================

const DEVICE_LISTEN_PORT = parseInt(process.env.MCS_DEVICE_PORT || '5000', 10)
const HANDSHAKE_TIMEOUT_MS = parseInt(process.env.MCS_HANDSHAKE_TIMEOUT_MS || '15000', 10)
const COMMAND_TIMEOUT_MS = parseInt(process.env.MCS_TCP_TIMEOUT_MS || '10000', 10)
const END_OF_FRAME = String.fromCharCode(3) // ^C — MCS frame terminator (see MCS protocol spec)
// Some responses ("ok" / error text) are plain messages without a ^C terminator.
// If no frame terminator arrives, treat a short idle gap as "response complete".
const RESPONSE_IDLE_MS = parseInt(process.env.MCS_RESPONSE_IDLE_MS || '300', 10)

// ==================== MAC Normalization ====================

/**
 * Normalize any MAC form to AA:BB:CC:DD:EE:FF (uppercase, colon-separated).
 * Accepts: "0080A3EE051F", "00:80:A3:EE:05:1F", "00-80-A3-EE-05-1F".
 * Returns null if the input is not a valid 12-hex-digit MAC.
 */
export function normalizeMac(raw: string): string | null {
  const clean = raw.toUpperCase().replace(/[:-\s]/g, '')
  if (/^[0-9A-F]{12}$/.test(clean)) {
    return clean.match(/.{2}/g)!.join(':')
  }
  return null
}

// ==================== Connection Registry ====================

export type DeviceConnection = {
  socket: Socket
  mac: string // normalized AA:BB:CC:DD:EE:FF
  remoteIp: string
  remotePort: number
  connectedAt: Date
  lastSeenAt: Date
  // Pending command response handling (ONE outstanding command per device —
  // the sign has no command queue, so overlapping sends must be rejected).
  inflight: boolean
  responseBuffer: string
  pendingResolve?: (data: string) => void
  pendingReject?: (err: Error) => void
  pendingTimeout?: NodeJS.Timeout
  pendingIdle?: NodeJS.Timeout
}

/** Registry: normalized MAC → active connection */
const connections = new Map<string, DeviceConnection>()

export function getActiveConnection(macAddress: string): DeviceConnection | undefined {
  const normalized = normalizeMac(macAddress)
  if (!normalized) return undefined
  return connections.get(normalized)
}

export function isDeviceOnline(macAddress: string): boolean {
  return !!getActiveConnection(macAddress)
}

export function getOnlineDevices(): Array<{ mac: string; remoteIp: string; remotePort: number; connectedAt: Date; lastSeenAt: Date }> {
  return Array.from(connections.values()).map((c) => ({
    mac: c.mac,
    remoteIp: c.remoteIp,
    remotePort: c.remotePort,
    connectedAt: c.connectedAt,
    lastSeenAt: c.lastSeenAt,
  }))
}

// ==================== Send Command Through Established Socket ====================

/**
 * Send an MCS packet to a device through its already-established portal connection.
 *
 * ⚠️ NO COMMAND QUEUEING: the sign can only process one packet at a time. This
 * function enforces that with a per-device `inflight` lock — a second send while
 * one is outstanding is rejected immediately ("device busy") rather than queued.
 *
 * Response handling uses a Promise that can settle in three ways:
 *   1. Device sends a ^C frame terminator → resolve with the response
 *   2. No terminator: a short idle gap after data → resolve with the response
 *   3. Timeout expires → resolve with whatever we have (some commands reply nothing)
 *
 * @param holdMs - after the response settles, keep the lock for this long so the
 *   sign can finish its flash write (Wait Time) before the next command. 0 = none.
 */
export function sendPacketToMac(
  macAddress: string,
  packet: string,
  timeoutMs: number = COMMAND_TIMEOUT_MS,
  holdMs: number = 0,
): Promise<string> {
  const conn = getActiveConnection(macAddress)
  if (!conn) {
    return Promise.reject(
      new Error(
        `Device ${macAddress} is not online. ` +
        'The xPico 240 must connect to the portal and complete the MAC handshake before commands can be issued.',
      ),
    )
  }
  if (conn.inflight) {
    return Promise.reject(
      new Error(
        'Device is busy processing a previous command. The sign has no command queue — ' +
        'wait for it to finish before sending the next packet.',
      ),
    )
  }

  return new Promise((resolve, reject) => {
    const conn2 = conn
    conn2.inflight = true
    conn2.responseBuffer = ''

    let settled = false
    const clearTimers = () => {
      if (conn2.pendingTimeout) clearTimeout(conn2.pendingTimeout)
      if (conn2.pendingIdle) clearTimeout(conn2.pendingIdle)
      conn2.pendingTimeout = undefined
      conn2.pendingIdle = undefined
      conn2.pendingResolve = undefined
      conn2.pendingReject = undefined
    }
    // Settle exactly once; release the lock immediately or after the WT hold.
    const settle = (finish: () => void) => {
      if (settled) return
      settled = true
      clearTimers()
      if (holdMs > 0) {
        setTimeout(() => {
          conn2.inflight = false
          finish()
        }, holdMs)
      } else {
        conn2.inflight = false
        finish()
      }
    }

    conn2.pendingResolve = (data: string) => settle(() => resolve(data))
    conn2.pendingReject = (err: Error) => settle(() => reject(err))
    conn2.pendingTimeout = setTimeout(() => conn2.pendingResolve?.(conn2.responseBuffer), timeoutMs)

    conn2.socket.write(packet, 'ascii', (err?: Error | null) => {
      if (err) conn2.pendingReject?.(new Error(`Write error: ${err.message}`))
    })
  })
}

// ==================== DB Status Sync ====================

async function markDisplayOnline(mac: string): Promise<void> {
  try {
    await prisma.display.updateMany({
      where: { macAddress: mac },
      data: { status: 'ONLINE', lastSeenAt: new Date() },
    })
  } catch (e) {
    console.error(`[DevicePortal] DB online update failed for ${mac}:`, (e as Error).message)
  }
}

async function markDisplayOffline(mac: string): Promise<void> {
  try {
    await prisma.display.updateMany({
      where: { macAddress: mac, status: 'ONLINE' },
      data: { status: 'OFFLINE' },
    })
  } catch (e) {
    console.error(`[DevicePortal] DB offline update failed for ${mac}:`, (e as Error).message)
  }
}

// ==================== TCP Server ====================

let serverInstance: Server | null = null

export function startDeviceServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket: Socket) => {
      const remoteIp = (socket.remoteAddress || '').replace(/^::ffff:/, '') || 'unknown'
      const remotePort = socket.remotePort ?? 0

      let handshakeDone = false
      let registeredMac: string | null = null
      let conn: DeviceConnection | null = null

      // Kill connections that don't send a valid MAC handshake in time
      const handshakeTimer = setTimeout(() => {
        if (!handshakeDone) {
          console.warn(`[DevicePortal] Handshake timeout from ${remoteIp}:${remotePort}, closing`)
          socket.destroy()
        }
      }, HANDSHAKE_TIMEOUT_MS)

      socket.on('data', async (data: Buffer) => {
        const text = data.toString('ascii')

        if (!handshakeDone) {
          // ── PHASE 1: MAC HANDSHAKE ──────────────────────────────────
          // The very first message from the xPico 240 must be its MAC address.
          // We normalize it (e.g. "0080A3EE051F" → "00:80:A3:EE:05:1F")
          // and store the socket in the registry so the REST API can find it later.
          const trimmed = text.trim()
          const normalized = normalizeMac(trimmed)
          if (normalized) {
            handshakeDone = true
            clearTimeout(handshakeTimer)
            registeredMac = normalized
            conn = {
              socket,
              mac: normalized,
              remoteIp,
              remotePort,
              connectedAt: new Date(),
              lastSeenAt: new Date(),
              inflight: false,
              responseBuffer: '',
            }
            connections.set(normalized, conn)
            console.log(`[DevicePortal] Device registered: ${normalized} (${remoteIp}:${remotePort})`)
            await markDisplayOnline(normalized)
          } else {
            console.warn(`[DevicePortal] Invalid handshake from ${remoteIp}:${remotePort}: "${trimmed.substring(0, 40)}"`)
          }
          return
        }

        // ── PHASE 2: COMMAND RESPONSES ───────────────────────────────
        // After the handshake, all incoming data is either:
        //   (a) a response to a command we sent, or
        //   (b) unsolicited data from the device (e.g. status updates)
        // We accumulate it in responseBuffer. If we see ^C (frame terminator)
        // and have a pending Promise from sendPacketToMac(), resolve it.
        if (conn) {
          const c = conn
          c.lastSeenAt = new Date()
          c.responseBuffer += text

          if (c.pendingResolve) {
            if (c.responseBuffer.includes(END_OF_FRAME)) {
              // Framed response — complete at the ^C terminator.
              c.pendingResolve(c.responseBuffer)
            } else {
              // Unframed response ("ok" / error text) — wait for a short idle gap
              // then treat the accumulated buffer as complete.
              if (c.pendingIdle) clearTimeout(c.pendingIdle)
              c.pendingIdle = setTimeout(() => {
                c.pendingResolve?.(c.responseBuffer)
              }, RESPONSE_IDLE_MS)
            }
          }
        }
      })

      socket.on('error', (err: Error) => {
        if (registeredMac) {
          console.error(`[DevicePortal] Socket error from ${registeredMac} (${remoteIp}): ${err.message}`)
        } else {
          console.error(`[DevicePortal] Socket error from ${remoteIp}: ${err.message}`)
        }
      })

      socket.on('close', () => {
        clearTimeout(handshakeTimer)
        if (registeredMac && conn) {
          // Reject any pending command
          if (conn.pendingReject) {
            conn.pendingReject(new Error(`Connection closed by device ${registeredMac}`))
          }
          connections.delete(registeredMac)
          console.log(`[DevicePortal] Device disconnected: ${registeredMac} (${remoteIp}:${remotePort})`)
          void markDisplayOffline(registeredMac)
        }
      })
    })

    server.on('error', (err: Error) => {
      console.error(`[DevicePortal] Server error: ${err.message}`)
      reject(err)
    })

    server.listen(DEVICE_LISTEN_PORT, () => {
      console.log('')
      console.log('📡 =============================================')
      console.log('📡  Device Portal (xPico 240) is listening!')
      console.log(`📡  TCP Port    : ${DEVICE_LISTEN_PORT}`)
      console.log('📡  Handshake   : device sends MAC (e.g. 0080A3EE051F)')
      console.log('📡  Protocol    : MCS v3.1 over TCP/IP (transparent serial)')
      console.log('📡 =============================================')
      console.log('')
      resolve()
    })

    serverInstance = server
  })
}

export function stopDeviceServer(): Promise<void> {
  return new Promise((resolve) => {
    // Close all active device sockets
    for (const conn of connections.values()) {
      conn.socket.destroy()
    }
    connections.clear()

    if (serverInstance) {
      serverInstance.close(() => {
        serverInstance = null
        resolve()
      })
    } else {
      resolve()
    }
  })
}
