// Interviewer speech with Boson Higgs TTS 3 (POST /v1/audio/speech, streamed).
import type { Voice } from '@deepdive/shared'
import { requireEnv } from '../env.ts'
import { UpstreamError, isRetryableStatus, withRetry } from './retry.ts'

const BOSON_URL = 'https://api.boson.ai/v1/audio/speech'

// Boson preset voices for the two choices on the Setup page.
const VOICES: Record<Voice, string> = {
  FEMALE: 'eleanor', // calm, professional
  MALE: 'oliver', // calm, thoughtful
}

// Until the response starts, and then for the whole stream of one question.
const TIMEOUT_MS = 30_000

// Starts speaking `text` and resolves once Boson begins answering. The stream yields
// raw PCM chunks (TTS_AUDIO format) as they are generated, about 1 s after the request.
// Retries only before the first byte: a stream cut halfway is not restarted.
export function streamSpeech(text: string, voice: Voice): Promise<ReadableStream<Uint8Array>> {
  const apiKey = requireEnv('BOSON_API_KEY')
  return withRetry(
    async (signal) => {
      let res: Response
      try {
        res = await fetch(BOSON_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'higgs-tts-3',
            input: text,
            voice: VOICES[voice],
            language: 'eng', // reads numbers and units the English way
            response_format: 'pcm', // streaming requires PCM
            stream: true,
          }),
          signal,
        })
      } catch (err) {
        throw new UpstreamError('TTS', (err as Error).message, true)
      }
      if (!res.ok || !res.body) {
        throw new UpstreamError('TTS', `HTTP ${res.status} ${await res.text()}`, isRetryableStatus(res.status))
      }
      return res.body
    },
    { attempts: 2, timeoutMs: TIMEOUT_MS },
  )
}
