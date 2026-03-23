import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

const api = {
  onRecordingStart: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.RECORDING_START, handler)
    return () => ipcRenderer.removeListener(IPC.RECORDING_START, handler)
  },
  onRecordingStop: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.RECORDING_STOP, handler)
    return () => ipcRenderer.removeListener(IPC.RECORDING_STOP, handler)
  },
  onStateChange: (callback: (state: string) => void) => {
    const handler = (_: unknown, state: string) => callback(state)
    ipcRenderer.on(IPC.STATE_CHANGE, handler)
    return () => ipcRenderer.removeListener(IPC.STATE_CHANGE, handler)
  },
  onError: (callback: (message: string) => void) => {
    const handler = (_: unknown, message: string) => callback(message)
    ipcRenderer.on(IPC.ERROR, handler)
    return () => ipcRenderer.removeListener(IPC.ERROR, handler)
  },
  onTranscriptionPreview: (callback: (text: string) => void) => {
    const handler = (_: unknown, text: string) => callback(text)
    ipcRenderer.on(IPC.TRANSCRIPTION_PREVIEW, handler)
    return () => ipcRenderer.removeListener(IPC.TRANSCRIPTION_PREVIEW, handler)
  },
  sendAudioComplete: (audioBuffer: ArrayBuffer, recordingMs?: number): Promise<unknown> => {
    return ipcRenderer.invoke(IPC.AUDIO_COMPLETE, audioBuffer, recordingMs ?? 0)
  },
  getSettings: (): Promise<unknown> => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (partial: Record<string, unknown>): Promise<unknown> => ipcRenderer.invoke(IPC.SETTINGS_SET, partial),
  openSettings: () => ipcRenderer.send(IPC.OPEN_SETTINGS),
  resizeBar: (w: number, h: number) => ipcRenderer.send(IPC.RESIZE_BAR, w, h)
}

contextBridge.exposeInMainWorld('api', api)
