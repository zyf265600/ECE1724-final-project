// Loudness of an audio signal as a 0-1 level, read once per animation frame.
// Used by the microphone check (level bar) and the meeting room (halo around the speaker).

// Loudness in decibels: -50 dB (room noise) is 0, -10 dB (loud speech) is 1.
// A decibel scale follows normal speech; a plain amplitude scale barely moves for it.
const FLOOR_DB = -50
const FULL_DB = -10
// Smoothing per reading: by default the level rises a quarter of the way to the new
// loudness and falls a tenth of the way, so it follows the voice without flickering.
// Larger values react faster.
const SMOOTHING = { rise: 0.25, fall: 0.1 }

// Returns read(): the smoothed level of what passes through the analyser right now.
export function levelMeter(analyser: AnalyserNode, { rise, fall } = SMOOTHING): () => number {
  analyser.fftSize = 512 // about 10 ms of audio per reading
  const samples = new Float32Array(analyser.fftSize)
  let shown = 0
  return () => {
    analyser.getFloatTimeDomainData(samples)
    // Root mean square = loudness, then decibels mapped onto 0-1.
    const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length)
    const db = 20 * Math.log10(rms || 1e-8)
    const target = Math.min(1, Math.max(0, (db - FLOOR_DB) / (FULL_DB - FLOOR_DB)))
    shown += (target - shown) * (target > shown ? rise : fall)
    return shown
  }
}
