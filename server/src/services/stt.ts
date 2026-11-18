// Answer transcription with Boson Higgs STT (higgs-stt-3.1).
//
// Boson has no plain "upload a file, get text" endpoint: Higgs STT runs inside a
// Higgs Realtime session. So the server opens a Realtime WebSocket in manual mode
// (no turn detection, text output, and no response.create, so the model never
// answers), appends the answer audio, commits it, and waits for the transcript.
import WebSocket from 'ws'
import { requireEnv } from '../env.ts'
import { PCM_RATE, splitPcm } from './audio.ts'
import { UpstreamError, withRetry } from './retry.ts'

const REALTIME_URL = 'wss://api.boson.ai/v1/realtime?model=higgs-realtime'

// Higgs STT keeps only the last ~60 s of one commit (our tests), so longer answers
// are committed in pieces and the transcripts joined.
const SEGMENT_SECONDS = 55
// One input_audio_buffer.append carries at most ~15 s; 5 s keeps each frame small.
const APPEND_SECONDS = 5
// Whole answer, per try: connecting plus all segments.
const TIMEOUT_MS = 60_000

interface RealtimeEvent {
  type: string
  transcript?: string
  error?: { message?: string }
}

// Close codes after which another try cannot help.
const FATAL_CLOSE: Record<number, string> = { 3000: 'invalid API key', 4429: 'no credit left or spending cap reached' }

// Transcribes raw PCM (24 kHz, 16-bit, mono). Returns '' for silence.
export function transcribe(pcm: Buffer): Promise<string> {
  const apiKey = requireEnv('BOSON_API_KEY')
  const segments = splitPcm(pcm, SEGMENT_SECONDS)
  return withRetry((signal) => transcribeOnce(apiKey, segments, signal), { attempts: 2, timeoutMs: TIMEOUT_MS })
}

async function transcribeOnce(apiKey: string, segments: Buffer[], signal: AbortSignal): Promise<string> {
  const ws = new WebSocket(REALTIME_URL, { headers: { Authorization: `Bearer ${apiKey}` } })
  // Errors are reported through 'close', which always follows; without a listener
  // an 'error' event would crash the process.
  ws.on('error', () => {})
  const abort = () => ws.terminate()
  signal.addEventListener('abort', abort)
  try {
    // Register the listener before sending, so the reply cannot slip past.
    const created = waitFor(ws, 'session.created', signal)
    created.catch(() => {}) // handled by the await below; avoids an unhandled rejection if opening fails
    await opened(ws)
    send(ws, {
      type: 'session.update',
      session: {
        model: 'higgs-realtime',
        output_modalities: ['text'],
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: PCM_RATE },
            turn_detection: null, // manual mode: we commit; nothing is said back
            transcription: { model: 'higgs-stt-3.1', language: 'en' },
          },
        },
      },
    })
    await created

    const texts: string[] = []
    for (const segment of segments) {
      for (const piece of splitPcm(segment, APPEND_SECONDS)) {
        send(ws, { type: 'input_audio_buffer.append', audio: piece.toString('base64') })
      }
      const done = waitFor(ws, 'conversation.item.input_audio_transcription.completed', signal)
      send(ws, { type: 'input_audio_buffer.commit' })
      texts.push(((await done).transcript ?? '').trim())
    }
    return texts.filter(Boolean).join(' ')
  } finally {
    signal.removeEventListener('abort', abort)
    ws.close()
  }
}

function send(ws: WebSocket, event: object) {
  ws.send(JSON.stringify(event))
}

function opened(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve()
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('close', (code) => reject(new UpstreamError('STT', `could not connect (code ${code})`, code !== 3000)))
  })
}

// Resolves with the next event of `type`; rejects on an error event, a failed
// transcription, the socket closing, or the time limit.
function waitFor(ws: WebSocket, type: string, signal: AbortSignal): Promise<RealtimeEvent> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      ws.off('message', onMessage)
      ws.off('close', onClose)
      signal.removeEventListener('abort', onAbort)
    }
    const fail = (err: Error) => {
      cleanup()
      reject(err)
    }
    const onMessage = (data: WebSocket.RawData) => {
      const event = JSON.parse(data.toString()) as RealtimeEvent
      if (event.type === type) {
        cleanup()
        resolve(event)
      } else if (event.type === 'error' || event.type === 'conversation.item.input_audio_transcription.failed') {
        fail(new UpstreamError('STT', event.error?.message ?? event.type, true))
      }
    }
    const onClose = (code: number) => {
      const fatal = FATAL_CLOSE[code]
      fail(new UpstreamError('STT', fatal ?? `connection closed (code ${code})`, !fatal))
    }
    const onAbort = () => fail(new UpstreamError('STT', `no transcript within ${TIMEOUT_MS / 1000} s`, true))
    ws.on('message', onMessage)
    ws.on('close', onClose)
    signal.addEventListener('abort', onAbort)
  })
}
