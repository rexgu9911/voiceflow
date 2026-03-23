import { execFile } from 'child_process'
import { promisify } from 'util'
import { log } from './logger'

const execFileAsync = promisify(execFile)

export interface ActiveAppInfo {
  name: string
  bundleId: string
  context: AppContext
}

export type AppContext = 'email' | 'chat' | 'code' | 'document' | 'social' | 'notes' | 'browser' | 'general'

const APP_CONTEXT: Record<string, AppContext> = {
  // Email
  'com.apple.mail': 'email',
  'com.google.Gmail': 'email',
  'com.microsoft.Outlook': 'email',
  'com.superhuman.electron': 'email',
  'com.readdle.smartemail.macos': 'email',

  // Chat
  'com.tinyspeck.slackmacgap': 'chat',
  'com.microsoft.teams2': 'chat',
  'net.whatsapp.WhatsApp': 'chat',
  'org.telegram.desktop': 'chat',
  'com.facebook.archon.developerID': 'chat',
  'com.hnc.Discord': 'chat',
  'com.apple.MobileSMS': 'chat',
  'ru.keepcoder.Telegram': 'chat',

  // Code
  'com.microsoft.VSCode': 'code',
  'com.todesktop.230313mzl4w4u92': 'code',
  'dev.zed.Zed': 'code',
  'com.sublimetext.4': 'code',
  'com.googlecode.iterm2': 'code',
  'com.apple.Terminal': 'code',

  // Documents
  'com.apple.iWork.Pages': 'document',
  'com.microsoft.Word': 'document',

  // Notes
  'com.apple.Notes': 'notes',
  'notion.id': 'notes',
  'md.obsidian': 'notes',
  'com.evernote.Evernote': 'notes',
  'com.craft.craft': 'notes',

  // Social
  'com.twitter.twitter-mac': 'social',

  // Browsers — detect by URL in a later version
  'com.apple.Safari': 'browser',
  'com.google.Chrome': 'browser',
  'company.thebrowser.Browser': 'browser',
  'org.mozilla.firefox': 'browser'
}

// For browsers, try to detect context from the active tab title
const BROWSER_TITLE_CONTEXT: Array<[RegExp, AppContext]> = [
  [/gmail|inbox|compose|mail/i, 'email'],
  [/slack|discord|messenger|whatsapp|telegram|teams/i, 'chat'],
  [/github|gitlab|codepen|replit|codesandbox|stackblitz/i, 'code'],
  [/notion|obsidian|evernote|google docs/i, 'notes'],
  [/twitter|x\.com|linkedin|reddit|facebook|instagram/i, 'social'],
  [/docs\.google|word online|overleaf/i, 'document']
]

// Cache the last detected app — captured at recording start
let cachedApp: ActiveAppInfo = { name: 'Unknown', bundleId: '', context: 'general' }

// Also match app by name as fallback when bundle ID is not in the map
const APP_NAME_CONTEXT: Array<[RegExp, AppContext]> = [
  [/^(Mail|Gmail|Outlook|Spark|Superhuman)$/i, 'email'],
  [/^(Slack|Teams|WhatsApp|Telegram|Discord|Messages|WeChat|微信)$/i, 'chat'],
  [/^(Code|VS Code|Visual Studio Code|Zed|Sublime Text|iTerm2?|Terminal|Cursor|Warp)$/i, 'code'],
  [/^(Pages|Word|Google Docs)$/i, 'document'],
  [/^(Notes|Notion|Obsidian|Evernote|Craft|Bear|Drafts|Logseq|Joplin)$/i, 'notes'],
  [/^(Twitter|X)$/i, 'social'],
  [/^(Safari|Google Chrome|Chrome|Firefox|Arc|Brave|Edge|Opera)$/i, 'browser']
]

async function detectActiveApp(): Promise<ActiveAppInfo> {
  try {
    // Get frontmost app name, bundle ID, and window title
    const { stdout } = await execFileAsync('osascript', [
      '-e',
      `tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set appId to bundle identifier of frontApp
        try
          set winTitle to name of front window of frontApp
        on error
          set winTitle to ""
        end try
        return appName & "|||" & appId & "|||" & winTitle
      end tell`
    ])

    const parts = stdout.trim().split('|||')
    const name = parts[0] || 'Unknown'
    const bundleId = parts[1] || ''
    const windowTitle = parts[2] || ''

    // Try bundle ID first (most reliable), then fall back to app name
    let context = APP_CONTEXT[bundleId] || 'general'
    if (context === 'general' && name !== 'Unknown') {
      for (const [pattern, ctx] of APP_NAME_CONTEXT) {
        if (pattern.test(name)) {
          context = ctx
          log('App name fallback: "' + name + '" → ' + ctx)
          break
        }
      }
    }

    // For browsers, try to detect context from window title
    if (context === 'browser' && windowTitle) {
      for (const [pattern, ctx] of BROWSER_TITLE_CONTEXT) {
        if (pattern.test(windowTitle)) {
          context = ctx
          log('Browser title "' + windowTitle.substring(0, 40) + '" → ' + ctx)
          break
        }
      }
    }

    return { name, bundleId, context }
  } catch (err) {
    log('Active app detection failed: ' + (err instanceof Error ? err.message : 'unknown'))
    return { name: 'Unknown', bundleId: '', context: 'general' }
  }
}

/**
 * Call this when recording STARTS (before VoiceFlow steals focus).
 * Caches the result so it's available when processing begins.
 */
export async function captureActiveApp(): Promise<void> {
  cachedApp = await detectActiveApp()
  log('Captured app: ' + cachedApp.name + ' (' + cachedApp.bundleId + ') → ' + cachedApp.context)
}

/**
 * Returns the cached app info from the last captureActiveApp() call.
 */
export function getActiveApp(): ActiveAppInfo {
  return cachedApp
}
