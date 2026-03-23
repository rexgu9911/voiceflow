import Store from 'electron-store'
import { VoiceFlowSettings, DEFAULT_SETTINGS } from '../shared/types'

let store: Store<VoiceFlowSettings>

export function initSettingsStore(): void {
  store = new Store<VoiceFlowSettings>({
    name: 'voiceflow-settings',
    defaults: DEFAULT_SETTINGS
  })
}

export function getSettings(): VoiceFlowSettings {
  return store.store
}

export function getSetting<K extends keyof VoiceFlowSettings>(
  key: K
): VoiceFlowSettings[K] {
  return store.get(key)
}

export function setSettings(partial: Partial<VoiceFlowSettings>): void {
  for (const [key, value] of Object.entries(partial)) {
    store.set(key as keyof VoiceFlowSettings, value)
  }
}
