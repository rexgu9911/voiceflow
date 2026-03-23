import { systemPreferences, dialog } from 'electron'
import { APP_NAME } from '../shared/constants'

/**
 * Check and request macOS Accessibility permission.
 * Required for uiohook (global hotkeys) and text injection.
 */
export function checkAccessibilityPermission(): boolean {
  const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
  if (!isTrusted) {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: `${APP_NAME} needs Accessibility permission`,
      message: `Please enable Accessibility access for ${APP_NAME} in System Settings > Privacy & Security > Accessibility.\n\nThis is required for the global hotkey and text injection features.`,
      buttons: ['Open System Settings', 'Later'],
      defaultId: 0
    })
    // Prompt the system dialog
    systemPreferences.isTrustedAccessibilityClient(true)
    return false
  }
  return true
}

/**
 * Check microphone permission status on macOS.
 */
export async function checkMicrophonePermission(): Promise<boolean> {
  const status = systemPreferences.getMediaAccessStatus('microphone')
  if (status === 'granted') {
    return true
  }

  if (status === 'not-determined') {
    const granted = await systemPreferences.askForMediaAccess('microphone')
    return granted
  }

  dialog.showMessageBoxSync({
    type: 'warning',
    title: `${APP_NAME} needs Microphone permission`,
    message: `Please enable Microphone access for ${APP_NAME} in System Settings > Privacy & Security > Microphone.`,
    buttons: ['OK']
  })

  return false
}
