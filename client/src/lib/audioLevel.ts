// Audio level 0-1, for the microphone check and the room halo.

// -50 dB (room noise) -> 0, -10 dB (loud speech) -> 1.
const FLOOR_DB = -50
const FULL_DB = -10
// Smoothing per reading; larger values react faster.
const SMOOTHING = { rise: 0.25, fall: 0.1 }

export function levelMeter(analyser: AnalyserNode, { rise, fall } = SMOOTHING): () => number {
  analyser.fftSize = 512 // ~10 ms per reading
  const samples = new Float32Array(analyser.fftSize)
  let shown = 0
  return () => {
    analyser.getFloatTimeDomainData(samples)
    // Loudness in dB, mapped to 0-1.
    const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length)
    const db = 20 * Math.log10(rms || 1e-8)
    const target = Math.min(1, Math.max(0, (db - FLOOR_DB) / (FULL_DB - FLOOR_DB)))
    shown += (target - shown) * (target > shown ? rise : fall)
    return shown
  }
}
