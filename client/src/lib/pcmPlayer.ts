import { TTS_AUDIO } from '@deepdive/shared'

// Plays the interviewer's streamed speech chunk by chunk.
export class PcmPlayer {
  private readonly context = new AudioContext()
  // Feeds the halo.
  readonly analyser = this.context.createAnalyser()
  private nextStart = 0 // context time at which the next chunk starts
  private leftover: Uint8Array | null = null // odd byte from the previous chunk
  private readonly sources = new Set<AudioBufferSourceNode>()

  constructor() {
    this.analyser.connect(this.context.destination)
  }

  // Call from a click; audio starts suspended.
  unlock(): Promise<void> {
    return this.context.resume()
  }

  play(chunk: ArrayBuffer) {
    let bytes = new Uint8Array(chunk)
    if (this.leftover) {
      const joined = new Uint8Array(this.leftover.length + bytes.length)
      joined.set(this.leftover)
      joined.set(bytes, this.leftover.length)
      bytes = joined
      this.leftover = null
    }
    // A chunk can split a 2-byte sample.
    if (bytes.length % 2 === 1) {
      this.leftover = bytes.slice(-1)
      bytes = bytes.subarray(0, -1)
    }
    const count = bytes.length / 2
    if (count === 0) return

    const buffer = this.context.createBuffer(TTS_AUDIO.channels, count, TTS_AUDIO.sampleRate)
    const samples = buffer.getChannelData(0)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let i = 0; i < count; i++) samples[i] = view.getInt16(i * 2, true) / 32768

    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.analyser)
    // A short lead absorbs network jitter.
    const start = Math.max(this.nextStart, this.context.currentTime + 0.1)
    source.start(start)
    this.nextStart = start + buffer.duration
    this.sources.add(source)
    source.onended = () => this.sources.delete(source)
  }

  // Resolves when all queued audio has played.
  finished(): Promise<void> {
    const last = [...this.sources].at(-1)
    if (!last) return Promise.resolve()
    return new Promise((resolve) => last.addEventListener('ended', () => resolve(), { once: true }))
  }

  stop() {
    for (const source of this.sources) source.stop()
    this.sources.clear()
    this.nextStart = 0
    this.leftover = null
  }

  close() {
    this.stop()
    void this.context.close()
  }
}
