import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import { TTS_AUDIO } from '@deepdive/shared'

// Raw PCM as used by Boson in both directions: 16-bit signed little-endian, mono, 24 kHz.
export const PCM_RATE = TTS_AUDIO.sampleRate
export const PCM_BYTES_PER_SECOND = PCM_RATE * 2

// Decodes any audio ffmpeg can read to raw PCM.
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
    // ffmpeg may close stdin on broken input; 'close' reports the failure.
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

// True if silent (below ~-40 dBFS); Higgs STT invents text for silence.
export function isSilent(pcm: Buffer): boolean {
  const threshold = 0.01 * 32768
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    if (Math.abs(pcm.readInt16LE(i)) > threshold) return false
  }
  return true
}

export function pcmDurationSeconds(pcm: Buffer): number {
  return pcm.length / PCM_BYTES_PER_SECOND
}

// Prepends a 44-byte WAV header to raw PCM.
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
