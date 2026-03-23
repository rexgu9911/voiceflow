import { useRef, useCallback, useEffect } from 'react'

function playTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume = 0.08,
  type: OscillatorType = 'sine'
): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)
  // Soft envelope — no clicks
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01)
  gain.gain.setValueAtTime(volume, startTime + duration * 0.3)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.02)
}

interface SoundFeedback {
  playStart: () => void
  playStop: () => void
  playSuccess: () => void
  playError: () => void
}

export function useSoundFeedback(): SoundFeedback {
  const ctxRef = useRef<AudioContext | null>(null)
  const enabledRef = useRef(true)

  // Check sound setting on mount and periodically
  useEffect(() => {
    const check = (): void => {
      window.api.getSettings().then((s: unknown) => {
        const settings = s as { soundFeedback?: boolean }
        enabledRef.current = settings.soundFeedback !== false
      }).catch(() => {})
    }
    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext()
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume()
    }
    return ctxRef.current
  }, [])

  // Start: soft ascending pair
  const playStart = useCallback(() => {
    if (!enabledRef.current) return
    try {
      const ctx = getCtx()
      const t = ctx.currentTime
      playTone(ctx, 880, t, 0.06, 0.06)
      playTone(ctx, 1175, t + 0.05, 0.08, 0.07)
    } catch {}
  }, [getCtx])

  // Stop: single soft click
  const playStop = useCallback(() => {
    if (!enabledRef.current) return
    try {
      const ctx = getCtx()
      const t = ctx.currentTime
      playTone(ctx, 1047, t, 0.05, 0.06)
    } catch {}
  }, [getCtx])

  // Success: gentle rising chord
  const playSuccess = useCallback(() => {
    if (!enabledRef.current) return
    try {
      const ctx = getCtx()
      const t = ctx.currentTime
      playTone(ctx, 784, t, 0.07, 0.05)
      playTone(ctx, 988, t + 0.05, 0.07, 0.06)
      playTone(ctx, 1175, t + 0.10, 0.10, 0.07)
    } catch {}
  }, [getCtx])

  // Error: low double tap
  const playError = useCallback(() => {
    if (!enabledRef.current) return
    try {
      const ctx = getCtx()
      const t = ctx.currentTime
      playTone(ctx, 330, t, 0.10, 0.07, 'triangle')
      playTone(ctx, 294, t + 0.10, 0.12, 0.06, 'triangle')
    } catch {}
  }, [getCtx])

  return { playStart, playStop, playSuccess, playError }
}
