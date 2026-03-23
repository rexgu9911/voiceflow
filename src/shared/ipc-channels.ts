export const IPC = {
  // Recording
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  AUDIO_COMPLETE: 'audio:complete',

  // State
  STATE_CHANGE: 'state:change',
  ERROR: 'error',
  TRANSCRIPTION_PREVIEW: 'transcription:preview',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  OPEN_SETTINGS: 'open:settings',
  VALIDATE_API_KEY: 'settings:validate-api-key',

  // History
  HISTORY_GET: 'history:get',
  HISTORY_STATS: 'history:stats',
  HISTORY_CLEAR: 'history:clear',

  // Window
  RESIZE_BAR: 'resize:bar'
} as const
