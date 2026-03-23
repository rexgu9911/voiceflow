import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useRecordingState } from '../../hooks/useRecordingState'
import {
  BAR_IDLE_W, BAR_IDLE_H,
  BAR_RECORDING_W, BAR_RECORDING_H,
  BAR_PROCESSING_W, BAR_PROCESSING_H
} from '../../../shared/constants'
import styles from './FloatingBar.module.css'

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

function FloatingBar(): React.ReactElement {
  const { state, errorMessage, previewText, stopFromUI, elapsedSeconds, getStream } = useRecordingState()
  const barsRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hover state for dormant → expanded idle transition
  const [hovered, setHovered] = useState(false)

  // Is the bar in an "active" (non-idle) state?
  const isActive = state !== 'idle' || !!previewText

  // Determine visual mode
  const isDormant = !isActive && !hovered

  // --- Hover handlers ---
  // IMPORTANT: These go on the .pill, NOT .wrap.
  // In Electron transparent windows, transparent pixels are click-through
  // and don't receive mouse events. The .wrap is transparent, so only the
  // pill (which has a real background) reliably fires enter/leave events.
  const onPillEnter = useCallback(() => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null }
    setHovered(true)
  }, [])

  const onPillLeave = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    // Short delay to handle transient leave events during CSS transitions
    // (pill is growing/shrinking and mouse might briefly be "outside")
    leaveTimer.current = setTimeout(() => setHovered(false), 300)
  }, [])

  // Clear hover when entering an active state (it'll auto-expand)
  useEffect(() => {
    if (isActive) {
      setHovered(false)
      if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null }
    }
  }, [isActive])

  // --- Window resize ---
  // Dormant and idle share the same window size — the pill shrinks
  // visually but the window (hover zone) stays constant. This prevents
  // the flicker loop caused by window resize pushing mouse out of bounds.
  useEffect(() => {
    let w: number, h: number

    if (state === 'recording') {
      w = BAR_RECORDING_W; h = BAR_RECORDING_H
    } else if (state !== 'idle' || previewText) {
      w = BAR_PROCESSING_W; h = BAR_PROCESSING_H
    } else {
      // Both dormant and hovered idle use the same window size
      w = BAR_IDLE_W; h = BAR_IDLE_H
    }

    window.api.resizeBar(w, h)
  }, [state, previewText])

  // --- Audio visualizer ---
  useEffect(() => {
    if (state !== 'recording') {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
      return
    }

    let active = true

    const pollInterval = setInterval(() => {
      const stream = getStream()
      if (!active) return
      if (!stream) return

      clearInterval(pollInterval)

      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const an = ctx.createAnalyser()
      an.fftSize = 32
      ctx.createMediaStreamSource(stream).connect(an)
      const d = new Uint8Array(an.frequencyBinCount)

      const tick = (): void => {
        if (!active || !barsRef.current) return
        an.getByteFrequencyData(d)
        const bars = barsRef.current.children
        for (let i = 0; i < bars.length; i++) {
          const v = d[Math.floor((i / bars.length) * d.length)] / 255
          const el = bars[i] as HTMLElement
          el.style.height = `${Math.max(3, v * 22)}px`
          el.style.opacity = `${0.35 + v * 0.65}`
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    }, 30)

    return () => {
      active = false
      clearInterval(pollInterval)
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 }
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [state, getStream])

  // --- Pill class ---
  let pillClass = styles.pillDormant
  if (state === 'recording') pillClass = styles.pillRecording
  else if (state === 'processing' || state === 'injecting') pillClass = styles.pillProcessing
  else if (state === 'error') pillClass = styles.pillError
  else if (previewText) pillClass = styles.pillSuccess
  else if (hovered) pillClass = styles.pillIdle
  // else: dormant (default)

  return (
    <div
      className={styles.wrap}
      onContextMenu={e => { e.preventDefault(); window.api.openSettings() }}
    >
      <div
        className={`${styles.pill} ${pillClass}`}
        onMouseEnter={onPillEnter}
        onMouseLeave={onPillLeave}
      >

        {/* Dormant — small pill with brand icon */}
        {isDormant && (
          <div className={styles.row} style={{ justifyContent: 'center', padding: 0 }}>
            <div className={styles.brandIcon} />
          </div>
        )}

        {/* Idle expanded (hovered) */}
        {!isActive && hovered && (
          <div className={styles.row}>
            <div className={styles.brandIcon} />
            <span className={styles.label}>VoiceFlow</span>
          </div>
        )}

        {/* Success preview */}
        {state === 'idle' && previewText && (
          <div className={styles.row}>
            <svg className={styles.checkmark} width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 7L5 10L11 3" stroke="#34c759" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={styles.previewText}>{previewText}</span>
          </div>
        )}

        {/* Recording */}
        {state === 'recording' && (
          <div className={styles.row}>
            <div className={styles.recDot} />
            <div className={styles.wave} ref={barsRef}>
              {[...Array(10)].map((_, i) => <div key={i} className={styles.bar} />)}
            </div>
            <span className={styles.time}>{fmt(elapsedSeconds)}</span>
            <button className={styles.stop} onClick={stopFromUI}>
              <div className={styles.sq} />
            </button>
          </div>
        )}

        {/* Processing */}
        {state === 'processing' && (
          <div className={styles.row}>
            <div className={styles.ringSpinner} />
            <span className={`${styles.processingLabel} ${styles.dots}`}>Processing</span>
          </div>
        )}

        {/* Injecting (brief checkmark flash) */}
        {state === 'injecting' && (
          <div className={styles.row}>
            <svg className={styles.checkmark} width="14" height="14" viewBox="0 0 13 13" fill="none">
              <path d="M2 7L5 10L11 3" stroke="#34c759" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        {/* Error */}
        {state === 'error' && (
          <div className={styles.row}>
            <svg className={styles.errorIcon} width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="5.5" stroke="#ff6961" strokeWidth="1.5" />
              <path d="M4.5 4.5L8.5 8.5M8.5 4.5L4.5 8.5" stroke="#ff6961" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className={styles.err}>{errorMessage || 'Error'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default FloatingBar
