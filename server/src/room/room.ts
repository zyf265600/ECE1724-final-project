// One meeting room: the voice loop for one interview over one WebSocket.
//
//   interview.start -> opening question -> speak -> listening
//   answer recording -> STT -> save turn -> LLM question -> save turn -> speak -> listening
//   time is up after an answer -> closing line -> ended -> scoring -> report.ready
//
// Every turn is saved as soon as it exists, so a reconnect continues where the
// interview stopped (see resume()).
import { randomUUID } from 'node:crypto'
import type { RawData, WebSocket } from 'ws'
import {
  MAX_ANSWER_BYTES,
  type ClientMessage,
  type RoomState,
  type ServerMessage,
  type Speaker,
  type WsErrorCode,
} from '@deepdive/shared'
import { prisma } from '../db.ts'
import { toTurnDto } from '../dto.ts'
import type { Interview, Turn } from '../generated/prisma/client.ts'
import { decodeToPcm, isSilent } from '../services/audio.ts'
import { nextQuestion, openingQuestion } from '../services/llm.ts'
import { scoreInterview } from '../services/scoring.ts'
import { audioKey, putAudio, storageConfigured } from '../services/storage.ts'
import { transcribe } from '../services/stt.ts'
import { streamSpeech } from '../services/tts.ts'

const CLOSING_LINE = "That's all the time we have. Thanks for walking me through your project."

export class Room {
  private state: RoomState | null = null // null until the interview starts

  constructor(
    private readonly ws: WebSocket,
    private interview: Interview,
    private readonly turns: Turn[],
  ) {}

  // Called once the socket is open: tells the client where the interview is.
  // Saved turns are sent as captions too: a turn saved while the client was
  // disconnected is not in the transcript it loaded (the client ignores duplicates).
  async resume(): Promise<void> {
    for (const turn of this.turns) this.send({ type: 'caption', turn: toTurnDto(turn) })
    switch (this.interview.status) {
      case 'CREATED':
        return // the client shows "Begin" and sends interview.start
      case 'LIVE': {
        const last = this.turns.at(-1)
        // The last question was already asked.
        if (last?.speaker === 'INTERVIEWER') return this.setState('listening')
        // Stopped after an answer, or before the first question: go on from there.
        return this.continueAfterAnswer()
      }
      default:
        return this.setState('ended')
    }
  }

  async handle(data: RawData, isBinary: boolean): Promise<void> {
    try {
      if (isBinary) return await this.onAnswer(toBuffer(data))
      let message: ClientMessage
      try {
        message = JSON.parse(data.toString()) as ClientMessage
      } catch {
        return this.sendError('BAD_STATE', 'Messages must be JSON.', false)
      }
      if (message.type === 'interview.start') return await this.onStart()
      if (message.type === 'interview.end') return await this.onEnd()
      this.sendError('BAD_STATE', 'Unknown message type.', false)
    } catch (err) {
      console.error(`room ${this.interview.id}:`, err)
      this.sendError('INTERNAL', 'Something went wrong on the server.', false)
    }
  }

  private async onStart() {
    if (this.interview.status !== 'CREATED' || this.state !== null) {
      return this.sendError('BAD_STATE', 'The interview has already started.', false)
    }
    this.setState('thinking') // set before the first await, so a second start is refused
    this.interview = await prisma.interview.update({
      where: { id: this.interview.id },
      data: { status: 'LIVE', startedAt: new Date() },
    })
    await this.askNext()
  }

  // The candidate ends the interview early.
  private async onEnd() {
    if (this.interview.status !== 'LIVE') return this.sendError('BAD_STATE', 'The interview is not running.', false)
    await this.finish()
  }

  // LIVE -> SCORING, then score. The client waits for report.ready on this socket;
  // if the socket is gone, the report page polls instead. Runs at most once: End can
  // be clicked while the closing line plays.
  private async finish() {
    if (this.interview.status !== 'LIVE') return
    this.interview = { ...this.interview, status: 'SCORING' } // before the await, so work in flight stops
    this.setState('ended')
    const { count } = await prisma.interview.updateMany({
      where: { id: this.interview.id, status: 'LIVE' },
      data: { status: 'SCORING', endedAt: new Date() },
    })
    if (count === 0) return // another room (an older tab) already ended it
    if (await scoreInterview(this.interview.id)) {
      this.send({ type: 'report.ready', interviewId: this.interview.id })
    } else {
      this.sendError('SCORING_FAILED', 'Scoring failed. Open the report to score again.', false)
    }
  }

  private async onAnswer(recording: Buffer) {
    if (this.state !== 'listening') return this.sendError('BAD_STATE', 'It is not your turn to answer.', false)
    if (recording.length > MAX_ANSWER_BYTES) {
      return this.sendError('AUDIO_TOO_LARGE', 'That answer is too long. Please answer in a few minutes or less.', false)
    }
    this.setState('thinking')

    let pcm: Buffer
    try {
      pcm = await decodeToPcm(recording)
    } catch (err) {
      console.error(`room ${this.interview.id}: decode failed`, err)
      return this.backToListening('STT_FAILED', 'Could not read the recording. Please answer again.', false)
    }
    const noSpeech = 'No speech was heard in that answer. Check your microphone and answer again.'
    if (isSilent(pcm)) return this.backToListening('STT_FAILED', noSpeech, false)
    let text: string
    try {
      text = await transcribe(pcm)
    } catch (err) {
      console.error(`room ${this.interview.id}: STT failed`, err)
      return this.backToListening('STT_FAILED', 'Could not transcribe your answer. Retry to send it again.', true)
    }
    if (!text) {
      return this.backToListening('STT_FAILED', noSpeech, false)
    }
    if (!this.isLive()) return // ended, or the socket closed, while transcribing

    const turnId = randomUUID()
    const key = await this.storeRecording(turnId, recording)
    if (!this.isLive()) return
    const turn = await this.saveTurn('CANDIDATE', text, key, turnId)
    this.send({ type: 'caption', turn: toTurnDto(turn) })
    await this.continueAfterAnswer()
  }

  // The time limit is checked between answers: a started answer is always heard out.
  private async continueAfterAnswer() {
    if (!this.isLive()) return
    if (!this.timeIsUp()) return this.askNext()
    this.setState('thinking')
    const turn = await this.saveTurn('INTERVIEWER', CLOSING_LINE, null)
    this.send({ type: 'caption', turn: toTurnDto(turn) })
    await this.speak(turn)
    await this.finish()
  }

  private timeIsUp(): boolean {
    const { startedAt, durationMin } = this.interview
    return startedAt !== null && Date.now() - startedAt.getTime() >= durationMin * 60_000
  }

  private async askNext() {
    this.setState('thinking')
    let text: string
    try {
      text =
        this.turns.length === 0
          ? openingQuestion()
          : await nextQuestion(this.interview.role, this.interview.difficulty, this.turns)
    } catch (err) {
      console.error(`room ${this.interview.id}: LLM failed`, err)
      // The answer is saved; reconnecting runs askNext again (see resume()).
      return this.sendError('LLM_FAILED', 'The interviewer could not prepare the next question.', true)
    }
    if (!this.isLive()) return // ended, or the socket closed, while thinking

    const turn = await this.saveTurn('INTERVIEWER', text, null)
    this.send({ type: 'caption', turn: toTurnDto(turn) })
    await this.speak(turn)
    this.setState('listening')
  }

  // Streams the question's audio. If TTS fails the caption is still on screen,
  // so the interview goes on.
  private async speak(turn: Turn) {
    if (!this.isOpen()) return
    this.setState('speaking')
    this.send({ type: 'audio.start', turnId: turn.id })
    try {
      const stream = await streamSpeech(turn.text, this.interview.voice)
      for await (const chunk of stream) {
        if (!this.isOpen()) break
        this.ws.send(chunk)
      }
    } catch (err) {
      console.error(`room ${this.interview.id}: TTS failed`, err)
      this.sendError('TTS_FAILED', 'Could not play the question. Please read it in the captions.', false)
    } finally {
      this.send({ type: 'audio.end', turnId: turn.id })
    }
  }

  // Returns the S3 key, or null when S3 is not set up or the upload failed:
  // losing the recording is better than losing the answer.
  private async storeRecording(turnId: string, recording: Buffer): Promise<string | null> {
    if (!storageConfigured()) return null
    const key = audioKey(this.interview.id, turnId)
    try {
      await putAudio(key, recording)
      return key
    } catch (err) {
      console.error(`room ${this.interview.id}: upload failed, saving the answer without audio`, err)
      return null
    }
  }

  private async saveTurn(speaker: Speaker, text: string, key: string | null, id?: string): Promise<Turn> {
    const turn = await prisma.turn.create({
      data: { id, interviewId: this.interview.id, index: this.turns.length, speaker, text, audioKey: key },
    })
    this.turns.push(turn)
    return turn
  }

  private backToListening(code: WsErrorCode, message: string, retryable: boolean) {
    this.sendError(code, message, retryable)
    this.setState('listening')
  }

  private setState(state: RoomState) {
    if (this.state === 'ended') return // nothing in flight may reopen a finished room
    this.state = state
    this.send({ type: 'state', state })
  }

  private sendError(code: WsErrorCode, message: string, retryable: boolean) {
    this.send({ type: 'error', code, message, retryable })
  }

  private send(message: ServerMessage) {
    if (this.isOpen()) this.ws.send(JSON.stringify(message))
  }

  // Work continues only while the interview runs and this socket is the client's.
  // After a disconnect the next socket's room takes over (see resume()), so this one
  // must not save turns that would collide with it.
  private isLive() {
    return this.interview.status === 'LIVE' && this.isOpen()
  }

  private isOpen() {
    return this.ws.readyState === this.ws.OPEN
  }
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  return Buffer.from(data)
}
