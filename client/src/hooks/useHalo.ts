import { useEffect, useRef } from 'react'
import { levelMeter } from '@/lib/audioLevel'

// Max halo size relative to the avatar.
const MAX_SCALE = 1.6
// Reacts faster than the microphone check, so the halo tracks each word.
const SMOOTHING = { rise: 0.5, fall: 0.2 }

// Halo that grows with the speaker's volume; updates the element directly each frame, bypassing React.
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
