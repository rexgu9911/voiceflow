import { uIOhook } from 'uiohook-napi'
import { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { captureActiveApp } from './active-app'
import { log } from './logger'

let floatingBarWindow: BrowserWindow | null = null

const OPT_KEYCODE = 56
const HOLD_THRESHOLD = 400

let optDown = false
let optDownTime = 0
let holdActive = false
let toggleRecording = false
let holdCheckInterval: ReturnType<typeof setInterval> | null = null
let processing = false

function send(channel: string): void {
  if (floatingBarWindow && !floatingBarWindow.isDestroyed()) {
    floatingBarWindow.webContents.send(channel)
  }
}

export function setProcessing(value: boolean): void {
  processing = value
}

export function initHotkeyManager(window: BrowserWindow): void {
  floatingBarWindow = window

  uIOhook.on('keydown', (e) => {
    if (e.keycode === OPT_KEYCODE && !optDown) {
      optDown = true
      optDownTime = Date.now()

      // Capture active app immediately — focus is still on target app.
      // Must be awaited so cache is populated before recording starts.
      if (!processing && !holdActive && !toggleRecording) {
        captureActiveApp().catch(() => {})
      }
    }
  })

  uIOhook.on('keyup', (e) => {
    if (e.keycode !== OPT_KEYCODE || !optDown) return
    optDown = false
    const heldMs = Date.now() - optDownTime

    // Hold release → stop
    if (holdActive) {
      holdActive = false
      send(IPC.RECORDING_STOP)
      log('Dictate: hold stop (' + heldMs + 'ms)')
      return
    }

    // Ignore while processing
    if (processing) return

    // Tap → toggle
    if (heldMs < HOLD_THRESHOLD) {
      if (!toggleRecording) {
        toggleRecording = true
        send(IPC.RECORDING_START)
        log('Dictate: toggle ON')
      } else {
        toggleRecording = false
        send(IPC.RECORDING_STOP)
        log('Dictate: toggle OFF')
      }
    }
  })

  // Hold detection
  holdCheckInterval = setInterval(() => {
    if (optDown && !holdActive && !toggleRecording && !processing) {
      if (Date.now() - optDownTime >= HOLD_THRESHOLD) {
        holdActive = true
        send(IPC.RECORDING_START)
        log('Dictate: hold start')
      }
    }
  }, 50)

  uIOhook.start()
  log('Hotkey ready: ⌥ Option (hold/tap)')
}

export function stopHotkeyManager(): void {
  if (holdCheckInterval) {
    clearInterval(holdCheckInterval)
    holdCheckInterval = null
  }
  uIOhook.stop()
}
