export const APP_NAME = 'VoiceFlow'
export const WHISPER_MODEL = 'whisper-1'
export const GPT_MODEL = 'gpt-4o-mini'
export const AUDIO_SAMPLE_RATE = 16000
export const AUDIO_CHANNELS = 1
export const PREVIEW_MAX_CHARS = 40
export const MIN_AUDIO_BYTES = 1500
export const CLIPBOARD_RESTORE_DELAY_MS = 200

// Floating bar sizing
// Window is larger than capsule to allow shadow/glow rendering
export const BAR_PAD = 24 // extra padding for glow effects
export const BAR_H = 44   // capsule height (expanded states)

// Dormant + Idle share the same WINDOW size so the hover zone doesn't
// shrink when the pill collapses — this prevents the flicker loop where
// window resize pushes the mouse outside the bounds, triggering mouseleave.
export const BAR_IDLE_W = 152 + BAR_PAD * 2
export const BAR_IDLE_H = BAR_H + BAR_PAD * 2

export const BAR_RECORDING_W = 224 + BAR_PAD * 2
export const BAR_RECORDING_H = BAR_H + BAR_PAD * 2
export const BAR_PROCESSING_W = 180 + BAR_PAD * 2
export const BAR_PROCESSING_H = BAR_H + BAR_PAD * 2
