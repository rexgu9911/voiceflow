import { useRef, useCallback } from 'react'

interface UseAudioRecorderReturn {
  startRecording: () => Promise<void>
  stopRecording: () => Promise<ArrayBuffer>
  getStream: () => MediaStream | null
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const cleanup = useCallback(() => {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()) } catch {}
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  const startRecording = useCallback(async () => {
    // Clean up any previous session
    cleanup()
    chunksRef.current = []

    // Get preferred mic from settings
    let micDeviceId = ''
    try {
      const settings = await window.api.getSettings() as { micDeviceId?: string }
      micDeviceId = settings.micDeviceId || ''
    } catch {}

    const audioConstraints: MediaTrackConstraints = {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true
    }
    if (micDeviceId) {
      audioConstraints.deviceId = { exact: micDeviceId }
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
    } catch {
      // If specific device fails, fall back to default
      if (micDeviceId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
          })
        } catch {
          throw new Error('Microphone access denied')
        }
      } else {
        throw new Error('Microphone access denied')
      }
    }
    streamRef.current = stream

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, { mimeType })
    } catch {
      cleanup()
      throw new Error('MediaRecorder not supported')
    }
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onerror = () => {
      cleanup()
    }

    recorder.start()
  }, [cleanup])

  const stopRecording = useCallback(async (): Promise<ArrayBuffer> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        cleanup()
        resolve(new ArrayBuffer(0))
        return
      }

      // Timeout: if onstop doesn't fire within 2s, resolve with empty
      const timeout = setTimeout(() => {
        cleanup()
        resolve(new ArrayBuffer(0))
      }, 2000)

      recorder.onstop = async () => {
        clearTimeout(timeout)
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
          const buffer = await blob.arrayBuffer()
          cleanup()
          resolve(buffer)
        } catch {
          cleanup()
          resolve(new ArrayBuffer(0))
        }
      }

      recorder.stop()
    })
  }, [cleanup])

  const getStream = useCallback(() => streamRef.current, [])

  return { startRecording, stopRecording, getStream }
}
