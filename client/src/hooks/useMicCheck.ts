import { useCallback, useEffect, useRef, useState } from 'react'
import { levelMeter } from '@/lib/audioLevel'

export type MicStatus = 'idle' | 'asking' | 'working' | 'blocked' | 'error'

// Microphone check: start() reports the level (0-1) each frame; stop() releases the microphone.

export function useMicCheck() {
  const [status, setStatus] = useState<MicStatus>('idle')
  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0)
  const cleanup = useRef<() => void>(() => {})

  useEffect(() => () => cleanup.current(), [])

  const stop = useCallback(() => {
    cleanup.current()
    cleanup.current = () => {}
    setTesting(false)
    setLevel(0)
  }, [])

  const start = useCallback(async () => {
    cleanup.current()
    setStatus('asking')
    let stream: MediaStream
    try {
      // Disable auto gain, which would flatten the level.
      stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false } })
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError'
      setStatus(denied ? 'blocked' : 'error')
      return
    }

    const context = new AudioContext()
    const analyser = context.createAnalyser()
    context.createMediaStreamSource(stream).connect(analyser)
    const read = levelMeter(analyser)

    let frame = 0
    const tick = () => {
      setLevel(read())
      frame = requestAnimationFrame(tick)
    }
    tick()

    cleanup.current = () => {
      cancelAnimationFrame(frame)
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
    }
    setStatus('working')
    setTesting(true)
  }, [])

  return { status, testing, level, start, stop }
}
