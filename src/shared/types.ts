export interface VoiceFlowSettings {
  openaiApiKey: string
  customDictionary: string[]
  language: string  // deprecated — use preferredLanguages instead
  preferredLanguages: string[]  // ISO 639-1 codes e.g. ['en','zh','ja'], or ['auto'] for full auto-detect
  autoStart: boolean
  soundFeedback: boolean
  micDeviceId: string  // '' = system default
}

export type RecordingState = 'idle' | 'recording' | 'processing' | 'injecting' | 'error'

export interface TranscriptionResult {
  rawText: string
  processedText: string
  durationMs: number
}

export const DEFAULT_SETTINGS: VoiceFlowSettings = {
  openaiApiKey: '',
  customDictionary: ['VoiceFlow'],
  language: 'auto',
  preferredLanguages: ['auto'],
  autoStart: false,
  soundFeedback: true,
  micDeviceId: ''
}
