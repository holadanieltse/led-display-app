// Device control routes: send MCS protocol commands to LED ticker devices
// via the xPico 240 portal (persistent TCP connection + MAC handshake).
import { Router, type Request, type Response, type NextFunction } from 'express'
import { prisma } from '../utils/prisma'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { assertOrgResource } from '../utils/permissions'
import { sendDeviceCommand, type DeviceCommand } from '../services/mcsService'
import { getActiveConnection, getOnlineDevices, sendPacketToMac } from '../services/deviceServer'

const router = Router()

// Valid device commands
const VALID_COMMANDS: DeviceCommand[] = [
  'power-on',
  'power-off',
  'restart',
  'clear-memory',
  'sync-time',
  'heartbeat',
]

/**
 * POST /api/displays/:id/device/:command
 * Send an MCS protocol command to a display device through its established
 * xPico 240 portal connection.
 *
 * Path params:
 *  - id: Display UUID
 *  - command: One of power-on, power-off, restart, clear-memory, sync-time, heartbeat
 *
 * The backend looks up the display's MAC, finds the active TCP connection in the
 * Device Portal registry, and pushes the MCS packet through that socket.
 */
router.post(
  '/displays/:id/device/:command',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, command } = req.params

      // Validate command
      if (!VALID_COMMANDS.includes(command as DeviceCommand)) {
        throw new AppError(
          `Invalid command "${command}". Valid commands: ${VALID_COMMANDS.join(', ')}`,
          400,
        )
      }

      // Load display (with org isolation)
      const display = await prisma.display.findUnique({ where: { id } })
      if (!display) {
        throw new AppError('Display not found', 404)
      }
      assertOrgResource(req, display.orgId)

      // Send the MCS command through the device's portal connection
      const result = await sendDeviceCommand(display.macAddress, command as DeviceCommand)

      // Update display status based on command
      if (command === 'power-off') {
        await prisma.display.update({
          where: { id },
          data: { status: 'OFFLINE' },
        })
      } else if (command === 'power-on' || command === 'restart') {
        await prisma.display.update({
          where: { id },
          data: { status: 'ONLINE', lastSeenAt: new Date() },
        })
      } else if (command === 'clear-memory') {
        await prisma.display.update({
          where: { id },
          data: { clearCacheNext: true },
        })
      }

      res.json({
        success: true,
        data: {
          command,
          displayId: id,
          displayName: display.name,
          macAddress: display.macAddress,
          ip: result.ip,
          response: result.response || '(no response — device may not acknowledge)',
        },
      })
    } catch (err) {
      // Device-not-online and TCP errors → 502 (Bad Gateway)
      if (err instanceof Error && (err.message.includes('not online') || err.message.includes('TCP') || err.message.includes('Write error') || err.message.includes('Connection closed'))) {
        next(new AppError(err.message, 502))
      } else {
        next(err)
      }
    }
  },
)

/**
 * POST /api/displays/:id/device/raw
 * Send a raw custom MCS command string to a display device and return serial port response.
 */
router.post(
  '/displays/:id/device/raw',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const { command } = req.body
      if (!command || typeof command !== 'string') {
        throw new AppError('Command string is required', 400)
      }

      const display = await prisma.display.findUnique({ where: { id } })
      if (!display) {
        throw new AppError('Display not found', 404)
      }
      assertOrgResource(req, display.orgId)

      // Ensure packet is properly wrapped in MCS delimiters
      let packetToSend = command.trim()
      if (packetToSend.endsWith('^C')) {
        packetToSend = packetToSend.slice(0, -2) + String.fromCharCode(3)
      } else if (!packetToSend.endsWith(String.fromCharCode(3))) {
        packetToSend = packetToSend + String.fromCharCode(3)
      }

      // If packet doesn't start with ^B or \x02, add ^B01^AC prefix
      if (!packetToSend.startsWith('^B') && !packetToSend.startsWith(String.fromCharCode(2))) {
        packetToSend = `^B01^AC${packetToSend}`
      }

      let rawResponse = ''
      try {
        rawResponse = await sendPacketToMac(display.macAddress, packetToSend, 6000)
      } catch (sendErr) {
        // If device is offline or socket error, re-throw to error handler
        throw sendErr
      }

      const displayResponse = rawResponse
        ? rawResponse.replace(/\x03/g, '^C').replace(/\x02/g, '^B').replace(/\x01/g, '^A').trim()
        : '--'

      res.json({
        success: true,
        data: {
          displayId: id,
          macAddress: display.macAddress,
          commandSent: command.trim(),
          packetSent: packetToSend.replace(/\x03/g, '^C'),
          response: displayResponse || '--',
        },
      })
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('not online') ||
          err.message.includes('TCP') ||
          err.message.includes('Write error') ||
          err.message.includes('Connection closed'))
      ) {
        next(new AppError(err.message, 502))
      } else {
        next(err)
      }
    }
  },
)

/**
 * GET /api/displays/:id/device/status
 * Check if the device has an active portal connection (online via handshake).
 */
router.get(
  '/displays/:id/device/status',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const display = await prisma.display.findUnique({ where: { id } })
      if (!display) {
        throw new AppError('Display not found', 404)
      }
      assertOrgResource(req, display.orgId)

      const conn = getActiveConnection(display.macAddress)

      res.json({
        success: true,
        data: {
          displayId: id,
          macAddress: display.macAddress,
          online: !!conn,
          remoteIp: conn?.remoteIp ?? null,
          remotePort: conn?.remotePort ?? null,
          connectedAt: conn?.connectedAt.toISOString() ?? null,
          lastSeenAt: conn?.lastSeenAt.toISOString() ?? null,
          dbStatus: display.status,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/devices/online
 * List all devices currently connected to the portal (across all orgs).
 * Useful for SUPER_ADMIN monitoring.
 */
router.get('/devices/online', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      data: getOnlineDevices(),
    })
  } catch (err) {
    next(err)
  }
})

export default router
