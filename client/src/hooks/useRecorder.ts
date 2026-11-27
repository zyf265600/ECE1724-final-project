import { useCallback, useEffect, useRef, useState } from 'react'
import { ANSWER_MIME_TYPE } from '@deepdive/shared'

// Records one answer at a time from a microphone stream opened once per interview.
export function useRecorder() {
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  // Feeds the halo only; doesn't affect the recording.
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!recording) return
    const started = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250)
    return () => clearInterval(timer)
  }, [recording])

  useEffect(
    () => () => {
      recorder.current?.stop()
      stream.current?.getTracks().forEach((track) => track.stop())
    },
    [],
  )
  useEffect(() => () => void (analyser?.context as AudioContext | undefined)?.close(), [analyser])

  // Throws if permission is denied.
  const open = useCallback(async () => {
    if (stream.current) return
    stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    const context = new AudioContext()
    const node = context.createAnalyser()
    context.createMediaStreamSource(stream.current).connect(node)
    setAnalyser(node)
  }, [])

  const start = useCallback(() => {
    if (!stream.current || recorder.current) return
    // Safari can't record WebM; the server decodes any format.
    const options = MediaRecorder.isTypeSupported(ANSWER_MIME_TYPE) ? { mimeType: ANSWER_MIME_TYPE } : undefined
    const next = new MediaRecorder(stream.current, options)
    next.start()
    recorder.current = next
    setSeconds(0)
    setRecording(true)
  }, [])

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const current = recorder.current
        recorder.current = null
        setRecording(false)
        if (!current) return resolve(null)
        const chunks: Blob[] = []
        current.ondataavailable = (event) => chunks.push(event.data)
        current.onstop = () => resolve(new Blob(chunks, { type: current.mimeType }))
        current.stop()
      }),
    [],
  )

  return { open, start, stop, recording, seconds, analyser }
}
