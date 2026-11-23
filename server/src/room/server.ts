// Accepts meeting-room WebSockets at `${WS_PATH}/:interviewId` on the HTTP server
// that also serves the REST API.
import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { MAX_ANSWER_BYTES, WS_PATH, type ServerMessage } from '@deepdive/shared'
import { prisma } from '../db.ts'
import { Room } from './room.ts'

// Close code sent to the older socket when the same interview is opened in another tab.
export const CLOSE_REPLACED = 4000

const ROOM_URL = new RegExp(`^${WS_PATH}/([\\w-]+)$`)

// One socket per interview; a newer one replaces the older.
const sockets = new Map<string, WebSocket>()

export function attachRooms(server: Server) {
  // A little above the answer limit, so a slightly too long answer gets a clear
  // AUDIO_TOO_LARGE error instead of the socket closing.
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
  // Buffer messages that arrive while the interview loads.
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
