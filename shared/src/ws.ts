// WebSocket protocol for the meeting room.
//
// The client connects to `${WS_PATH}/${interviewId}`. JSON messages are text frames.
// Audio travels as binary frames:
//   client -> server: one complete answer recording (MediaRecorder output, ANSWER_MIME_TYPE),
//                     sent when the candidate clicks "Finish answer". Accepted only in state 'listening'.
//   server -> client: raw interviewer speech chunks (TTS_AUDIO format) for the turn named
//                     in the latest 'audio.start', until the matching 'audio.end'.
import type { TurnDto } from './rest.ts'

export const WS_PATH = '/ws/interviews'

export const ANSWER_MIME_TYPE = 'audio/webm;codecs=opus'
export const MAX_ANSWER_BYTES = 10 * 1024 * 1024

// Format of the streamed interviewer audio: 16-bit signed little-endian PCM, mono, 24 kHz.
export const TTS_AUDIO = { encoding: 'pcm_s16le', sampleRate: 24000, channels: 1 } as const

// What the room is doing right now; the UI shows it and opens the microphone only in 'listening'.
//   speaking:  interviewer audio is playing
//   thinking:  server is transcribing the answer or writing the next question
//   listening: candidate's turn
//   ended:     interview is over; scoring runs in the background
export type RoomState = 'speaking' | 'thinking' | 'listening' | 'ended'

export type ClientMessage =
  | { type: 'interview.start' } // CREATED -> LIVE; the server asks the first question
  | { type: 'interview.end' } // candidate ends early; the server closes the interview and starts scoring

export type WsErrorCode =
  | 'NOT_FOUND' // unknown interview id; the server closes the socket
  | 'BAD_STATE' // message not allowed now, e.g. audio while not 'listening'
  | 'AUDIO_TOO_LARGE'
  | 'STT_FAILED'
  | 'LLM_FAILED'
  | 'TTS_FAILED'
  | 'SCORING_FAILED'
  | 'INTERNAL'

export type ServerMessage =
  // Sent on every change, and on connect once the interview has started
  // (for a CREATED interview the server waits for 'interview.start').
  | { type: 'state'; state: RoomState }
  // A turn was saved: the interviewer's question, or the candidate's transcribed answer.
  | { type: 'caption'; turn: TurnDto }
  // Binary audio frames for this interviewer turn follow, until 'audio.end'.
  | { type: 'audio.start'; turnId: string }
  | { type: 'audio.end'; turnId: string }
  // Scoring finished; load it with GET /api/interviews/:id/report.
  | { type: 'report.ready'; interviewId: string }
  // retryable: the client may repeat its last action. STT_FAILED: resend the same answer recording.
  // LLM_FAILED: reconnect; on connect the server asks the question it could not write.
  | { type: 'error'; code: WsErrorCode; message: string; retryable: boolean }
