import { app } from 'electron'
import { initSettingsStore } from './settings-store'
import { initHistory } from './history'
import { createFloatingBarWindow, getFloatingBarWindow } from './windows'
import { createTray, destroyTray } from './tray'
import { initHotkeyManager, stopHotkeyManager } from './hotkey-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { checkAccessibilityPermission, checkMicrophonePermission } from './permissions'
import { log } from './logger'

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

// Menu bar app — hide dock icon
app.dock?.hide()

app.whenReady().then(async () => {
  log('VoiceFlow starting...')

  try {
    initSettingsStore()
    initHistory()
    log('Stores initialized')

    registerIpcHandlers()

    checkAccessibilityPermission()
    const micOk = await checkMicrophonePermission()
    log('Permissions: mic=' + micOk)

    const floatingBar = createFloatingBarWindow()
    createTray()
    initHotkeyManager(floatingBar)

    log('VoiceFlow ready')
  } catch (error) {
    log('Startup error: ' + (error instanceof Error ? error.message : error))
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  log('VoiceFlow quitting')
  stopHotkeyManager()
  destroyTray()
})

app.on('second-instance', () => {
  const win = getFloatingBarWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})
