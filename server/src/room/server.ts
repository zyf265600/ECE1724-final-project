// Meeting-room WebSockets at `${WS_PATH}/:interviewId`.
import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { MAX_ANSWER_BYTES, WS_PATH, type ServerMessage } from '@deepdive/shared'
import { prisma } from '../db.ts'
import { Room } from './room.ts'

// Sent to the older socket when another tab opens the interview.
export const CLOSE_REPLACED = 4000

const ROOM_URL = new RegExp(`^${WS_PATH}/([\\w-]+)$`)

// One socket per interview; a newer socket replaces the older one.
const sockets = new Map<string, WebSocket>()

export function attachRooms(server: Server) {
  // Slightly above the answer limit, so oversized answers get AUDIO_TOO_LARGE, not a close.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_ANSWER_BYTES + 1024 * 1024 })

  server.on('upgrade', (req, socket, head) => {
    const id = ROOM_URL.exec(new URL(req.url ?? '', 'http://localhost').pathname)?.[1]
    if (!id) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      openRoom(ws, id).catch((err) => {
        console.error(`room ${id}: could not open`, err)
        ws.close(1011)
      })
    })
  })
}

async function openRoom(ws: WebSocket, id: string) {
  // Bad frames emit 'error'; unhandled, it would crash the server.
  ws.on('error', (err) => console.error(`room ${id}: socket error`, err.message))
  // Buffer messages while the interview loads.
  const early: [Parameters<Room['handle']>[0], boolean][] = []
  const buffer = (data: Parameters<Room['handle']>[0], isBinary: boolean) => early.push([data, isBinary])
  ws.on('message', buffer)

  const interview = await prisma.interview.findUnique({
    where: { id },
    include: { turns: { orderBy: { index: 'asc' } } },
  })
  if (!interview) {
    const message: ServerMessage = { type: 'error', code: 'NOT_FOUND', message: 'Interview not found.', retryable: false }
    ws.send(JSON.stringify(message))
    ws.close()
    return
  }

  if (ws.readyState !== ws.OPEN) return // closed while loading; do not replace a newer socket
  sockets.get(id)?.close(CLOSE_REPLACED, 'Opened in another tab')
  sockets.set(id, ws)
  ws.on('close', () => {
    if (sockets.get(id) === ws) sockets.delete(id)
  })

  const { turns, ...row } = interview
  const room = new Room(ws, row, turns)
  ws.off('message', buffer)
  ws.on('message', (data, isBinary) => void room.handle(data, isBinary))
  await room.resume()
  for (const [data, isBinary] of early) await room.handle(data, isBinary)
}
