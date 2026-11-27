import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  WS_PATH,
  type ClientMessage,
  type RoomState,
  type ServerMessage,
  type TurnDto,
  type WsErrorCode,
} from '@deepdive/shared'
import { PcmPlayer } from '@/lib/pcmPlayer'

// Close code: the interview was opened in another tab.
const CLOSE_REPLACED = 4000

export interface RoomError {
  code: WsErrorCode | 'CONNECTION'
  message: string
  retryable: boolean
}

export interface RoomView {
  connection: 'connecting' | 'open' | 'closed'
  state: RoomState | null // null until the interview starts
  captions: TurnDto[]
  playing: boolean // interviewer audio is still playing
  error: RoomError | null
  reportReady: boolean
}

type Action =
  | { type: 'connection'; connection: RoomView['connection'] }
  | { type: 'state'; state: RoomState }
  | { type: 'caption'; turn: TurnDto }
  | { type: 'playing'; playing: boolean }
  | { type: 'error'; error: RoomError | null }
  | { type: 'reportReady' }

function reducer(view: RoomView, action: Action): RoomView {
  switch (action.type) {
    case 'connection':
      // No state until the server sends the current one.
      return action.connection === 'connecting'
        ? { ...view, connection: action.connection, state: null }
        : { ...view, connection: action.connection }
    case 'state':
      return { ...view, state: action.state }
    case 'caption':
      if (view.captions.some((t) => t.id === action.turn.id)) return view
      return { ...view, captions: [...view.captions, action.turn].sort((a, b) => a.index - b.index) }
    case 'playing':
      return { ...view, playing: action.playing }
    case 'error':
      return { ...view, error: action.error }
    case 'reportReady':
      return { ...view, reportReady: true }
  }
}

// Meeting-room WebSocket (protocol: shared/src/ws.ts).
export function useRoom(interviewId: string, savedTurns: TurnDto[]) {
  const [view, dispatch] = useReducer(reducer, {
    connection: 'connecting',
    state: null,
    captions: savedTurns,
    playing: false,
    error: null,
    reportReady: false,
  })
  const socket = useRef<WebSocket | null>(null)
  const player = useRef<PcmPlayer | null>(null)
  const muted = useRef(false) // set by End interview
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null) // for the halo

  const connect = useCallback(() => {
    socket.current?.close()
    // A dropped socket never sends audio.end.
    player.current?.stop()
    dispatch({ type: 'playing', playing: false })
    dispatch({ type: 'connection', connection: 'connecting' })
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}${WS_PATH}/${interviewId}`)
    ws.binaryType = 'arraybuffer'
    socket.current = ws

    ws.onopen = () => dispatch({ type: 'connection', connection: 'open' })
    ws.onclose = (event) => {
      if (socket.current !== ws) return // replaced by a newer connection
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
          // Wait until the queued audio has played.
          void player.current?.finished().then(() => dispatch({ type: 'playing', playing: false }))
          break
        case 'error':
          dispatch({ type: 'error', error: message })
          break
        case 'report.ready':
          dispatch({ type: 'reportReady' })
          break
      }
    }
  }, [interviewId])

  useEffect(() => {
    player.current = new PcmPlayer()
    setAnalyser(player.current.analyser)
    connect()
    return () => {
      const ws = socket.current
      socket.current = null
      ws?.close()
      player.current?.close()
    }
  }, [connect])

  // False if the socket is not open.
  const send = useCallback((message: ClientMessage | Blob) => {
    const ws = socket.current
    if (ws?.readyState !== WebSocket.OPEN) return false
    ws.send(message instanceof Blob ? message : JSON.stringify(message))
    return true
  }, [])

  return {
    view,
    analyser,
    // Call from a click; browsers block audio until the user interacts.
    unlockAudio: () => player.current?.unlock(),
    start: () => {
      if (send({ type: 'interview.start' })) dispatch({ type: 'state', state: 'thinking' })
    },
    end: () => {
      if (!send({ type: 'interview.end' })) return
      muted.current = true
      player.current?.stop()
      dispatch({ type: 'playing', playing: false })
    },
    sendAnswer: (recording: Blob) => {
      dispatch({ type: 'error', error: null })
      // Block re-recording until the server replies.
      if (send(recording)) dispatch({ type: 'state', state: 'thinking' })
    },
    reconnect: () => {
      dispatch({ type: 'error', error: null })
      connect()
    },
    dismissError: () => dispatch({ type: 'error', error: null }),
  }
}
