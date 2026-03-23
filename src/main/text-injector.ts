import { clipboard } from 'electron'
import { execFile } from 'child_process'
import { CLIPBOARD_RESTORE_DELAY_MS } from '../shared/constants'
import { log } from './logger'

function execAppleScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 3000 }, (error) => {
      if (error) reject(new Error('Paste failed'))
      else resolve()
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function injectText(text: string): Promise<void> {
  // Save clipboard — both text and HTML to preserve rich content
  let prevText = ''
  let prevHtml = ''
  try {
    prevText = clipboard.readText()
    prevHtml = clipboard.readHTML()
  } catch {}

  // Write and paste
  clipboard.writeText(text)

  try {
    await execAppleScript('tell application "System Events" to keystroke "v" using command down')
  } catch (e) {
    log('Paste failed, text in clipboard')
    throw new Error('Paste failed — use Cmd+V manually')
  }

  // Restore after paste completes
  await sleep(CLIPBOARD_RESTORE_DELAY_MS)

  try {
    if (prevText || prevHtml) {
      // Restore original clipboard content
      if (prevHtml) {
        clipboard.write({ text: prevText, html: prevHtml })
      } else if (prevText) {
        clipboard.writeText(prevText)
      }
    } else {
      clipboard.clear()
    }
  } catch (err) {
    log('Clipboard restore failed: ' + (err instanceof Error ? err.message : 'unknown'))
  }
}
