import { useEffect, useRef } from 'react'
import { levelMeter } from '@/lib/audioLevel'

// How far the halo grows at full loudness: 1.6 = 60 % wider than the avatar.
const MAX_SCALE = 1.6
// Reacts about twice as fast as the microphone check's level bar, so it moves with each word.
const SMOOTHING = { rise: 0.5, fall: 0.2 }

// A halo behind a speaker's avatar that grows with how loud they are, like a video call.
// Returns a ref for the halo element. While `active`, each animation frame reads the
// analyser and sets the element's size and opacity directly (no React render per frame);
// otherwise the halo is hidden.
export function useHalo(analyser: AnalyserNode | null | undefined, active: boolean) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const halo = ref.current
    if (!halo) return
    const show = (level: number) => {
      halo.style.transform = `scale(${1 + (MAX_SCALE - 1) * level})`
      halo.style.opacity = level > 0.02 ? String(0.35 + 0.4 * level) : '0'
    }
    if (!active || !analyser) return show(0)

    const read = levelMeter(analyser, SMOOTHING)
    let frame = 0
    const tick = () => {
      show(read())
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(frame)
      show(0)
    }
  }, [analyser, active])

  return ref
}
