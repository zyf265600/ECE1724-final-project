import { useCallback, useEffect, useRef, useState } from 'react'

export type MicStatus = 'idle' | 'asking' | 'working' | 'blocked' | 'error'

// Microphone check for the Setup page: asks for permission, then reports the
// input level (0-1) about 60 times a second so the page can draw a level bar.
// Everything is released when the page unmounts.
export function useMicCheck() {
  const [status, setStatus] = useState<MicStatus>('idle')
  const [level, setLevel] = useState(0)
  const cleanup = useRef<() => void>(() => {})

  useEffect(() => () => cleanup.current(), [])

  const start = useCallback(async () => {
    cleanup.current()
    setStatus('asking')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError'
      setStatus(denied ? 'blocked' : 'error')
      return
    }

    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    context.createMediaStreamSource(stream).connect(analyser)
    const samples = new Float32Array(analyser.fftSize)

    let frame = 0
    const tick = () => {
      analyser.getFloatTimeDomainData(samples)
      // Root mean square = loudness; speech is roughly 0.02-0.2, so scale it up for the bar.
      const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length)
      setLevel(Math.min(1, rms * 6))
      frame = requestAnimationFrame(tick)
    }
    tick()

    cleanup.current = () => {
      cancelAnimationFrame(frame)
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
    }
    setStatus('working')
  }, [])

  return { status, level, start }
}
