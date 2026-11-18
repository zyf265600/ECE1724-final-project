import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import { TTS_AUDIO } from '@deepdive/shared'

// Raw PCM as used by Boson in both directions: 16-bit signed little-endian, mono, 24 kHz.
export const PCM_RATE = TTS_AUDIO.sampleRate
export const PCM_BYTES_PER_SECOND = PCM_RATE * 2

// Decodes any audio file ffmpeg can read (the browser's WebM/Opus answer, WAV, MP3)
// into raw PCM. ffmpeg-static ships the ffmpeg binary inside node_modules.
export function decodeToPcm(input: Buffer): Promise<Buffer> {
  if (!ffmpegPath) return Promise.reject(new Error('ffmpeg-static has no binary for this platform'))
  const args = ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0']
  args.push('-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', String(PCM_RATE), 'pipe:1')

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath as unknown as string, args)
    const out: Buffer[] = []
    let stderr = ''
    ffmpeg.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    ffmpeg.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    ffmpeg.on('error', reject)
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out))
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`))
    })
    // ffmpeg may stop reading early on a broken file; the 'close' handler reports that.
    ffmpeg.stdin.on('error', () => {})
    ffmpeg.stdin.end(input)
  })
}

// Cuts PCM into pieces of at most `seconds` each (on sample boundaries).
export function splitPcm(pcm: Buffer, seconds: number): Buffer[] {
  const size = seconds * PCM_BYTES_PER_SECOND
  const pieces: Buffer[] = []
  for (let start = 0; start < pcm.length; start += size) pieces.push(pcm.subarray(start, start + size))
  return pieces
}

export function pcmDurationSeconds(pcm: Buffer): number {
  return pcm.length / PCM_BYTES_PER_SECOND
}

// Wraps raw PCM in a 44-byte WAV header so any audio player can open it.
export function pcmToWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16) // size of the fmt chunk
  header.writeUInt16LE(1, 20) // format: PCM
  header.writeUInt16LE(1, 22) // channels: mono
  header.writeUInt32LE(PCM_RATE, 24)
  header.writeUInt32LE(PCM_BYTES_PER_SECOND, 28)
  header.writeUInt16LE(2, 32) // bytes per sample
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
