// Transcribes an audio file with Higgs STT.
//   npm run stt -w server -- answer.webm
// Accepts any format ffmpeg can read.
import { readFile } from 'node:fs/promises'
import { decodeToPcm, pcmDurationSeconds } from '../src/services/audio.ts'
import { transcribe } from '../src/services/stt.ts'

const file = process.argv[2]
if (!file) throw new Error('Usage: npm run stt -w server -- <audio file>')

const pcm = await decodeToPcm(await readFile(file))
console.log(`Audio length: ${pcmDurationSeconds(pcm).toFixed(1)} s`)

const start = performance.now()
const text = await transcribe(pcm)
console.log(`STT time:     ${Math.round(performance.now() - start)} ms`)
console.log(`Transcript:   ${text || '(empty)'}`)
