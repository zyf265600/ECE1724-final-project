import { useCallback, useEffect, useRef, useState } from 'react'

export type MicStatus = 'idle' | 'asking' | 'working' | 'blocked' | 'error'

// Microphone check for the Setup page. start() asks for permission and then reports
// the input level (0-1) once per animation frame so the page can draw a level bar;
// stop() ends the test and releases the microphone. A passed test stays 'working'.
// Everything is released when the page unmounts.

// The bar maps loudness in decibels: -50 dB (room noise) is empty, -10 dB (loud speech) is full.
// A decibel scale follows normal speech; a plain amplitude scale barely moves for it.
const FLOOR_DB = -50
const FULL_DB = -10
// Smoothing per frame: the bar rises a quarter of the way to the new level and falls
// a tenth of the way, so it follows the voice without flickering.
const RISE = 0.25
const FALL = 0.1

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
      // Automatic gain control would even out loud and quiet speech, so the bar would
      // barely follow the voice; the check measures the raw input instead.
      stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false } })
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError'
      setStatus(denied ? 'blocked' : 'error')
      return
    }

    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 512 // about 10 ms of audio per reading
    context.createMediaStreamSource(stream).connect(analyser)
    const samples = new Float32Array(analyser.fftSize)

    let frame = 0
    let shown = 0
    const tick = () => {
      analyser.getFloatTimeDomainData(samples)
      // Root mean square = loudness, then decibels mapped onto the bar.
      const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length)
      const db = 20 * Math.log10(rms || 1e-8)
      const target = Math.min(1, Math.max(0, (db - FLOOR_DB) / (FULL_DB - FLOOR_DB)))
      shown += (target - shown) * (target > shown ? RISE : FALL)
      setLevel(shown)
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
