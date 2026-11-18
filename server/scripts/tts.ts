// Speaks one sentence with Higgs TTS and saves it as a WAV file.
//   npm run tts -w server -- "Why did you choose PostgreSQL?" [--voice MALE] [--out question.wav]
// Prints the time to the first audio chunk, the number that decides how long
// the candidate waits after each answer.
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { Voice } from '@deepdive/shared'
import { pcmDurationSeconds, pcmToWav } from '../src/services/audio.ts'
import { streamSpeech } from '../src/services/tts.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    voice: { type: 'string', default: 'FEMALE' },
    out: { type: 'string', default: join(tmpdir(), 'deepdive-tts.wav') },
  },
})
const text = positionals.join(' ') || 'Tell me about a project you are proud of, and what you built yourself.'
const voice = values.voice.toUpperCase() as Voice
if (voice !== 'MALE' && voice !== 'FEMALE') throw new Error('--voice must be MALE or FEMALE')

const start = performance.now()
const chunks: Uint8Array[] = []
let firstChunkMs = 0
for await (const chunk of await streamSpeech(text, voice)) {
  if (chunks.length === 0) firstChunkMs = performance.now() - start
  chunks.push(chunk)
}
const pcm = Buffer.concat(chunks)
await writeFile(values.out, pcmToWav(pcm))

console.log(`Voice:        ${voice}`)
console.log(`First audio:  ${Math.round(firstChunkMs)} ms`)
console.log(`Total:        ${Math.round(performance.now() - start)} ms`)
console.log(`Audio length: ${pcmDurationSeconds(pcm).toFixed(1)} s`)
console.log(`Saved:        ${values.out}`)
