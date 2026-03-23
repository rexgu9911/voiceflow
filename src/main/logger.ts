import { appendFileSync, statSync, renameSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

let logPath: string | null = null
const MAX_LOG_SIZE = 2 * 1024 * 1024  // 2MB

function getLogPath(): string {
  if (!logPath) {
    try {
      logPath = join(app.getPath('userData'), 'voiceflow.log')
    } catch {
      logPath = join(process.cwd(), 'debug.log')
    }
  }
  return logPath
}

let lineCount = 0

function rotateIfNeeded(): void {
  // Check every ~100 writes to avoid stat() on every log call
  if (++lineCount % 100 !== 0) return
  try {
    const p = getLogPath()
    const size = statSync(p).size
    if (size > MAX_LOG_SIZE) {
      const backup = p + '.old'
      try { unlinkSync(backup) } catch {}
      renameSync(p, backup)
    }
  } catch {}
}

export function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    rotateIfNeeded()
    appendFileSync(getLogPath(), line)
  } catch {}
  process.stderr.write(line)
}

export function getLogFilePath(): string {
  return getLogPath()
}
