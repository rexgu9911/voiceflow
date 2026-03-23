import { useState, useEffect, useCallback, useRef } from 'react'
import { useAudioRecorder } from './useAudioRecorder'
import { useSoundFeedback } from './useSoundFeedback'

type RecordingState = 'idle' | 'recording' | 'processing' | 'injecting' | 'error'

interface UseRecordingStateReturn {
  state: RecordingState
  errorMessage: string
  previewText: string
  stopFromUI: () => void
  elapsedSeconds: number
  getStream: () => MediaStream | null
}

export function useRecordingState(): UseRecordingStateReturn {
  const [state, setState] = useState<RecordingState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const { startRecording, stopRecording, getStream } = useAudioRecorder()
  const { playStart, playStop, playSuccess, playError } = useSoundFeedback()
  const isRecordingRef = useRef(false)
  const prevStateRef = useRef<RecordingState>('idle')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedRef = useRef(0)

  const startTimer = useCallback(() => {
    elapsedRef.current = 0
    setElapsedSeconds(0)
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1
      setElapsedSeconds(elapsedRef.current)
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setElapsedSeconds(0)
  }, [])

  const handleStart = useCallback(async () => {
    if (isRecordingRef.current) return
    isRecordingRef.current = true
    setState('recording')
    setPreviewText('')
    startTimer()
    try {
      await startRecording()
      playStart()
    } catch {
      setState('error')
      setErrorMessage('Microphone access denied')
      playError()
      isRecordingRef.current = false
      stopTimer()
    }
  }, [startRecording, playStart, playError, startTimer, stopTimer])

  const handleStop = useCallback(async () => {
    if (!isRecordingRef.current) return
    isRecordingRef.current = false
    const recordingMs = elapsedRef.current * 1000
    stopTimer()
    playStop()

    try {
      const audioBuffer = await stopRecording()
      if (audioBuffer.byteLength === 0) { setState('idle'); return }
      setState('processing')
      await window.api.sendAudioComplete(audioBuffer, recordingMs)
    } catch {
      setState('error')
      setErrorMessage('Processing failed')
      playError()
    }
  }, [stopRecording, playStop, playError, stopTimer])

  // Expose stop for UI button
  const stopFromUI = useCallback(() => {
    handleStop()
  }, [handleStop])

  useEffect(() => {
    const c1 = window.api.onRecordingStart(handleStart)
    const c2 = window.api.onRecordingStop(handleStop)

    const c3 = window.api.onStateChange((s: string) => {
      const newState = s as RecordingState
      if (prevStateRef.current === 'injecting' && newState === 'idle') playSuccess()
      if (newState === 'error') playError()
      prevStateRef.current = newState
      setState(newState)
    })

    const c4 = window.api.onError((msg: string) => setErrorMessage(msg))

    const c5 = window.api.onTranscriptionPreview((text: string) => {
      setPreviewText(text)
      setTimeout(() => setPreviewText(''), 2500)
    })

    return () => {
      c1(); c2(); c3(); c4(); c5()
      stopTimer()
    }
  }, [handleStart, handleStop, playSuccess, playError, stopTimer])

  return { state, errorMessage, previewText, stopFromUI, elapsedSeconds, getStream }
}
