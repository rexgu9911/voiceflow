export interface VoiceFlowAPI {
  onRecordingStart: (callback: () => void) => () => void
  onRecordingStop: (callback: () => void) => () => void
  onStateChange: (callback: (state: string) => void) => () => void
  onError: (callback: (message: string) => void) => () => void
  onTranscriptionPreview: (callback: (text: string) => void) => () => void
  sendAudioComplete: (audioBuffer: ArrayBuffer, recordingMs?: number) => Promise<unknown>
  getSettings: () => Promise<unknown>
  setSettings: (partial: Record<string, unknown>) => Promise<unknown>
  openSettings: () => void
  resizeBar: (w: number, h: number) => void
}

declare global {
  interface Window {
    api: VoiceFlowAPI
  }
}
