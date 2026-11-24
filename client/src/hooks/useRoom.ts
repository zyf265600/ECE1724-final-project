import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  WS_PATH,
  type ClientMessage,
  type RoomState,
  type ServerMessage,
  type TurnDto,
  type WsErrorCode,
} from '@deepdive/shared'
import { PcmPlayer } from '@/lib/pcmPlayer'

// Close code the server uses when the same interview is opened in another tab.
const CLOSE_REPLACED = 4000

export interface RoomError {
  code: WsErrorCode | 'CONNECTION'
  message: string
  retryable: boolean
}

export interface RoomView {
  connection: 'connecting' | 'open' | 'closed'
  state: RoomState | null // null until the interview starts
  captions: TurnDto[] // both speakers, in index order
  playing: boolean // interviewer audio is still audible
  error: RoomError | null
}

type Action =
  | { type: 'connection'; connection: RoomView['connection'] }
  | { type: 'state'; state: RoomState }
  | { type: 'caption'; turn: TurnDto }
  | { type: 'playing'; playing: boolean }
  | { type: 'error'; error: RoomError | null }

function reducer(view: RoomView, action: Action): RoomView {
  switch (action.type) {
    case 'connection':
      return { ...view, connection: action.connection }
    case 'state':
      return { ...view, state: action.state }
    case 'caption':
      if (view.captions.some((t) => t.id === action.turn.id)) return view
      return { ...view, captions: [...view.captions, action.turn].sort((a, b) => a.index - b.index) }
    case 'playing':
      return { ...view, playing: action.playing }
    case 'error':
      return { ...view, error: action.error }
  }
}

// The meeting-room connection (protocol in shared/src/ws.ts): keeps the room state
// and captions, and plays the interviewer's streamed speech.
export function useRoom(interviewId: string, savedTurns: TurnDto[]) {
  const [view, dispatch] = useReducer(reducer, {
    connection: 'connecting',
    state: null,
    captions: savedTurns,
    playing: false,
    error: null,
  })
  const socket = useRef<WebSocket | null>(null)
  const player = useRef<PcmPlayer | null>(null)
  const muted = useRef(false) // set by End interview: no more interviewer audio

  const connect = useCallback(() => {
    socket.current?.close()
    dispatch({ type: 'connection', connection: 'connecting' })
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}${WS_PATH}/${interviewId}`)
    ws.binaryType = 'arraybuffer'
    socket.current = ws

    ws.onopen = () => dispatch({ type: 'connection', connection: 'open' })
    ws.onclose = (event) => {
      if (socket.current !== ws) return // replaced by a newer connection on purpose
      dispatch({ type: 'connection', connection: 'closed' })
      const message =
        event.code === CLOSE_REPLACED ? 'This interview was opened in another tab.' : 'Lost the connection to the server.'
      dispatch({ type: 'error', error: { code: 'CONNECTION', message, retryable: event.code !== CLOSE_REPLACED } })
    }
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        if (!muted.current) player.current?.play(event.data)
        return
      }
      const message = JSON.parse(event.data as string) as ServerMessage
      switch (message.type) {
        case 'state':
          dispatch({ type: 'state', state: message.state })
          break
        case 'caption':
          dispatch({ type: 'caption', turn: message.turn })
          break
        case 'audio.start':
          dispatch({ type: 'playing', playing: true })
          break
        case 'audio.end':
          // The last chunks are still queued; wait until they have been heard.
          void player.current?.finished().then(() => dispatch({ type: 'playing', playing: false }))
          break
        case 'error':
          dispatch({ type: 'error', error: message })
          break
        case 'report.ready':
          break // the report page arrives in stage 2.2
      }
    }
  }, [interviewId])

  useEffect(() => {
    player.current = new PcmPlayer()
    connect()
    return () => {
      const ws = socket.current
      socket.current = null
      ws?.close()
      player.current?.close()
    }
  }, [connect])

  const send = useCallback((message: ClientMessage | Blob) => {
    const ws = socket.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(message instanceof Blob ? message : JSON.stringify(message))
  }, [])

  return {
    view,
    // Call from a click: browsers only allow audio after a user gesture.
    unlockAudio: () => player.current?.unlock(),
    start: () => send({ type: 'interview.start' }),
    // Ending cuts the interviewer off: queued audio stops and later chunks are dropped.
    end: () => {
      if (socket.current?.readyState !== WebSocket.OPEN) return
      send({ type: 'interview.end' })
      muted.current = true
      player.current?.stop()
      dispatch({ type: 'playing', playing: false })
    },
    sendAnswer: (recording: Blob) => {
      dispatch({ type: 'error', error: null })
      dispatch({ type: 'state', state: 'thinking' }) // the server confirms; avoids recording again meanwhile
      send(recording)
    },
    reconnect: () => {
      dispatch({ type: 'error', error: null })
      connect()
    },
    dismissError: () => dispatch({ type: 'error', error: null }),
  }
}
