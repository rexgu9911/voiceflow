import { ipcMain, clipboard, Notification, app } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { RecordingState } from '../shared/types'
import { PREVIEW_MAX_CHARS, MIN_AUDIO_BYTES } from '../shared/constants'
import { getSettings, setSettings } from './settings-store'
import { transcribeAudio } from './whisper-client'
import { processTranscription } from './llm-processor'
import { injectText } from './text-injector'
import { getFloatingBarWindow } from './windows'
import { createSettingsWindow } from './windows'
import { getActiveApp } from './active-app'
import { addHistoryEntry, getHistory, getStats, clearHistory } from './history'
import { setProcessing } from './hotkey-manager'
import { log } from './logger'

let isProcessing = false

function sendStateChange(state: RecordingState): void {
  const win = getFloatingBarWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.STATE_CHANGE, state)
  }
}

function sendError(message: string): void {
  const win = getFloatingBarWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.ERROR, message)
  }
}

function sendPreview(text: string): void {
  const win = getFloatingBarWindow()
  if (win && !win.isDestroyed()) {
    const preview = text.length > PREVIEW_MAX_CHARS ? text.substring(0, PREVIEW_MAX_CHARS) + '...' : text
    win.webContents.send(IPC.TRANSCRIPTION_PREVIEW, preview)
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.AUDIO_COMPLETE, async (_event, audioData: ArrayBuffer, recordingMs: number = 0) => {
    // Prevent concurrent processing
    if (isProcessing) {
      log('Ignored: already processing')
      return
    }
    isProcessing = true
    setProcessing(true)

    let rawText = ''

    try {
      const t0 = Date.now()
      sendStateChange('processing')

      const audioBuffer = Buffer.from(audioData)
      log('Audio: ' + audioBuffer.length + ' bytes')

      // Minimum audio size check — WebM/Opus encodes silence at ~2-3KB/s
      // 1500 bytes ≈ less than 0.5s of actual audio, likely no speech
      if (audioBuffer.length < MIN_AUDIO_BYTES) {
        log('Audio too short (' + audioBuffer.length + ' bytes), skipping')
        sendStateChange('idle')
        return
      }

      const settings = getSettings()
      if (!settings.openaiApiKey) {
        throw new Error('No API Key — open Settings')
      }

      // Use app captured at recording start (not now — focus may have shifted)
      const activeApp = getActiveApp()
      log('App: ' + activeApp.name + ' → ' + activeApp.context)

      // Whisper STT (verbose_json format — includes no_speech_prob + detected language)
      const t1 = Date.now()
      const whisperResult = await transcribeAudio(audioBuffer)
      const whisperMs = Date.now() - t1
      rawText = whisperResult.text
      const detectedLang = whisperResult.detectedLanguage
      log('Whisper (' + whisperMs + 'ms, lang=' + detectedLang + ', noSpeech=' + whisperResult.noSpeech + (whisperResult.retried ? ', retried' : '') + '): ' + rawText)

      // No speech detected — Whisper's own model says nobody is talking
      if (whisperResult.noSpeech) {
        log('No speech detected, skipping')
        sendStateChange('idle')
        return
      }

      if (!rawText || rawText.trim().length === 0) {
        log('Empty transcription')
        sendStateChange('idle')
        return
      }

      // Always run GPT — every transcription needs punctuation, filler removal,
      // and formatting regardless of language or length
      let processedText = rawText
      const t2 = Date.now()
      processedText = await processTranscription(rawText, activeApp.context, activeApp.name, detectedLang)
      log('GPT (' + (Date.now() - t2) + 'ms): ' + processedText)

      // Inject text
      sendStateChange('injecting')
      await injectText(processedText)

      // Preview + done
      sendPreview(processedText)
      const totalMs = Date.now() - t0
      log('Done: ' + totalMs + 'ms')

      await new Promise((r) => setTimeout(r, 800))
      sendStateChange('idle')

      // Save history — use actual detected language, not settings language
      addHistoryEntry({
        timestamp: Date.now(),
        rawText,
        processedText,
        durationMs: totalMs,
        app: activeApp.name,
        language: detectedLang || settings.language
      }, recordingMs)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log('ERROR: ' + message)

      // Fallback: copy to clipboard
      if (rawText && rawText.trim().length > 0) {
        try {
          clipboard.writeText(rawText)
          sendError('Error — text copied to clipboard')
          new Notification({ title: 'VoiceFlow', body: 'Raw text copied to clipboard.', silent: true }).show()
        } catch {}
      } else {
        sendError(message)
      }

      sendStateChange('error')
      setTimeout(() => sendStateChange('idle'), 5000)
    } finally {
      isProcessing = false
      setProcessing(false)
    }
  })

  // Settings
  ipcMain.handle(IPC.SETTINGS_GET, () => getSettings())
  ipcMain.handle(IPC.SETTINGS_SET, (_event, partial: Record<string, unknown>) => {
    setSettings(partial)
    // Wire up launch at login
    if ('autoStart' in partial) {
      app.setLoginItemSettings({ openAtLogin: !!partial.autoStart })
    }
    return getSettings()
  })

  // Validate API key — quick GPT ping
  ipcMain.handle(IPC.VALIDATE_API_KEY, async (_event, key: string) => {
    if (!key || !key.startsWith('sk-')) return { valid: false, error: 'Invalid key format' }
    try {
      const https = await import('https')
      const body = JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
      const result = await new Promise<string>((resolve, reject) => {
        const req = https.request({
          hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => resolve(res.statusCode + ':' + Buffer.concat(chunks).toString()))
        })
        req.on('error', (e) => reject(e))
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')) })
        req.write(body)
        req.end()
      })
      const status = parseInt(result.split(':')[0])
      if (status >= 200 && status < 300) return { valid: true }
      if (status === 401) return { valid: false, error: 'Invalid API key' }
      if (status === 429) return { valid: true, error: 'Valid but rate limited' }
      return { valid: false, error: 'API error (' + status + ')' }
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : 'Connection error' }
    }
  })

  // History
  ipcMain.handle(IPC.HISTORY_GET, (_event, limit?: number) => getHistory(limit))
  ipcMain.handle(IPC.HISTORY_STATS, () => getStats())
  ipcMain.handle(IPC.HISTORY_CLEAR, () => { clearHistory(); return true })

  ipcMain.on(IPC.OPEN_SETTINGS, () => createSettingsWindow())
}
