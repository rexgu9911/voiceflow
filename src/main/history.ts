import Store from 'electron-store'

export interface HistoryEntry {
  id: string
  timestamp: number
  rawText: string
  processedText: string
  durationMs: number
  app: string // which app was active
  language: string
  wordCount: number
}

interface HistoryStore {
  entries: HistoryEntry[]
  totalWords: number
  totalSessions: number
  timeSavedMs: number
  totalRecordingMs: number
}

const TYPING_WPM = 45
const DICTATION_WPM = 220
const MAX_ENTRIES = 500

let store: Store<HistoryStore>

export function initHistory(): void {
  store = new Store<HistoryStore>({
    name: 'voiceflow-history',
    defaults: {
      entries: [],
      totalWords: 0,
      totalSessions: 0,
      timeSavedMs: 0,
      totalRecordingMs: 0
    }
  })
}

export function addHistoryEntry(
  entry: Omit<HistoryEntry, 'id' | 'wordCount'>,
  recordingMs = 0
): HistoryEntry {
  const wordCount = entry.processedText.split(/[\s\u3000]+/).filter(Boolean).length
  const full: HistoryEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    wordCount
  }

  const entries = store.get('entries')
  entries.unshift(full)
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES
  store.set('entries', entries)

  // Update stats
  store.set('totalWords', store.get('totalWords') + wordCount)
  store.set('totalSessions', store.get('totalSessions') + 1)

  // Track total recording (speaking) time for avg WPM calculation
  if (recordingMs > 0) {
    store.set('totalRecordingMs', store.get('totalRecordingMs') + recordingMs)
  }

  // Time saved calculation: time to type vs time to dictate
  const typingTimeMs = (wordCount / TYPING_WPM) * 60000
  const dictationTimeMs = entry.durationMs
  const saved = Math.max(0, typingTimeMs - dictationTimeMs)
  store.set('timeSavedMs', store.get('timeSavedMs') + saved)

  return full
}

export function getHistory(limit = 50): HistoryEntry[] {
  return store.get('entries').slice(0, limit)
}

export interface HistoryStats {
  totalWords: number
  totalSessions: number
  timeSavedMs: number
  totalRecordingMs: number
  avgWpm: number
}

export function getStats(): HistoryStats {
  const totalWords = store.get('totalWords')
  const totalRecordingMs = store.get('totalRecordingMs')
  const avgWpm = totalRecordingMs > 0
    ? Math.round((totalWords / totalRecordingMs) * 60000)
    : 0

  return {
    totalWords,
    totalSessions: store.get('totalSessions'),
    timeSavedMs: store.get('timeSavedMs'),
    totalRecordingMs,
    avgWpm
  }
}

export function clearHistory(): void {
  store.set('entries', [])
  store.set('totalWords', 0)
  store.set('totalSessions', 0)
  store.set('timeSavedMs', 0)
  store.set('totalRecordingMs', 0)
}
