import { BrowserWindow, screen, ipcMain, app } from 'electron'
import { join } from 'path'
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { BAR_IDLE_W, BAR_IDLE_H } from '../shared/constants'
import { IPC } from '../shared/ipc-channels'
import { getSettings } from './settings-store'
import { getStats } from './history'

let floatingBarWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null

export function createFloatingBarWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = display.workAreaSize

  floatingBarWindow = new BrowserWindow({
    width: BAR_IDLE_W,
    height: BAR_IDLE_H,
    x: Math.round(screenWidth / 2 - BAR_IDLE_W / 2),
    y: screenHeight - BAR_IDLE_H - 4,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  floatingBarWindow.setAlwaysOnTop(true, 'floating')
  floatingBarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (process.env.ELECTRON_RENDERER_URL) {
    floatingBarWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/floating`)
  } else {
    floatingBarWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: '/floating'
    })
  }

  floatingBarWindow.once('ready-to-show', () => {
    floatingBarWindow?.show()
  })

  // Resize handler — anchor the BOTTOM edge of the window so it doesn't
  // jump around when switching between states. Only width and upward
  // expansion change; the bottom stays pinned.
  const BOTTOM_GAP = 4 // distance from bottom of screen
  ipcMain.on(IPC.RESIZE_BAR, (_event, w: number, h: number) => {
    if (!floatingBarWindow || floatingBarWindow.isDestroyed()) return
    const display = screen.getPrimaryDisplay()
    const { width: sw, height: sh } = display.workAreaSize
    const x = Math.round(sw / 2 - w / 2)
    // Pin bottom edge: the bottom of the window is always at (sh - BOTTOM_GAP)
    const y = sh - h - BOTTOM_GAP
    floatingBarWindow.setBounds({ x, y, width: w, height: h })
  })

  // Reposition if display changes (monitor plugged/unplugged, resolution change)
  screen.on('display-metrics-changed', () => {
    if (!floatingBarWindow || floatingBarWindow.isDestroyed()) return
    const display = screen.getPrimaryDisplay()
    const { width: sw, height: sh } = display.workAreaSize
    const [w, h] = floatingBarWindow.getSize()
    const x = Math.round(sw / 2 - w / 2)
    const y = sh - h - BOTTOM_GAP
    floatingBarWindow.setBounds({ x, y, width: w, height: h })
  })

  floatingBarWindow.on('closed', () => {
    floatingBarWindow = null
  })

  return floatingBarWindow
}

export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return settingsWindow
  }

  settingsWindow = new BrowserWindow({
    width: 840,
    height: 620,
    minWidth: 720,
    minHeight: 480,
    title: 'VoiceFlow',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#1a1a1a',
    resizable: true,
    minimizable: true,
    maximizable: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  })

  const settings = getSettings()
  const stats = getStats()
  const timeSavedMin = Math.round(stats.timeSavedMs / 60000)
  const hasKey = !!settings.openaiApiKey
  const soundOn = settings.soundFeedback !== false
  const autoStartOn = !!settings.autoStart

  // Escape values for safe HTML embedding
  const escAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const safeApiKey = escAttr(settings.openaiApiKey || '')
  const safeDictionary = escAttr((settings.customDictionary || []).join('\n'))
  const preferredLangs: string[] = settings.preferredLanguages?.length ? settings.preferredLanguages : ['auto']
  const appVersion = app.getVersion() || '1.0.0'

  // Brand icon — Pure scalable SVG for perfect transparency and crispness
  const brandLogo = (size: number): string => `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="currentColor" style="flex-shrink:0;opacity:0.9;"><rect x="22" y="46" width="8" height="8" rx="4"/><rect x="36" y="34" width="8" height="32" rx="4"/><rect x="50" y="22" width="8" height="56" rx="4"/><rect x="64" y="34" width="8" height="32" rx="4"/><rect x="78" y="46" width="8" height="8" rx="4"/></svg>`

  const settingsHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>VoiceFlow</title>
<style>
:root {
  --bg-primary: #0C0C0E;
  --bg-secondary: #131316;
  --bg-tertiary: #1C1C20;
  --bg-hover: rgba(255, 255, 255, 0.05);
  --bg-active: rgba(255, 255, 255, 0.09);
  --bg-input: #101012;
  --border: rgba(255, 255, 255, 0.06);
  --border-focus: rgba(124, 110, 240, 0.5);
  --text-primary: #F2F2F7;
  --text-secondary: #A0A0A5;
  --text-tertiary: #6E6E73;
  --accent: #5E5CE6;
  --accent-soft: rgba(94, 92, 230, 0.15);
  --green: #30D158;
  --red: #FF453A;
  --orange: #FF9F0A;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow: hidden;
  font-size: 13px;
}

/* Hero Banners */
.hero-banner {
  border-radius: 20px;
  padding: 36px 32px;
  margin-bottom: 32px;
  background: linear-gradient(135deg, rgba(82, 78, 183, 0.4), rgba(41, 39, 92, 0.2), transparent);
  border: 1px solid rgba(255,255,255,0.06);
  position: relative;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08);
}
.hero-banner::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(circle at top right, rgba(255,255,255,0.1), transparent 70%);
  pointer-events: none;
}
.hero-title {
  font-family: ui-serif, Georgia, "Playfair Display", "Times New Roman", serif;
  font-size: 32px;
  font-weight: 500;
  color: #fff;
  letter-spacing: -0.2px;
  margin-bottom: 12px;
  line-height: 1.1;
  text-shadow: 0 2px 10px rgba(0,0,0,0.5);
}
.hero-subtitle {
  font-size: 14px;
  color: rgba(255,255,255,0.8);
  max-width: 80%;
  line-height: 1.5;
  font-weight: 500;
}

/* Drag region */
.drag-region {
  height: 52px;
  -webkit-app-region: drag;
  flex-shrink: 0;
}

/* Layout */
.layout {
  display: flex;
  height: calc(100vh - 52px);
}

/* Sidebar */
.sidebar {
  width: 190px;
  padding: 0 12px 24px;
  border-right: 1px solid var(--border);
  flex-shrink: 0;
  overflow-y: auto;
  background: var(--bg-primary);
}
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 10px 28px;
}
.sidebar-brand-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.2px;
}
.sidebar-section {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  padding: 16px 10px 8px;
}
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin-bottom: 3px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  user-select: none;
}
.sidebar-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.sidebar-item.active {
  background: var(--bg-active);
  color: var(--text-primary);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.05);
}
.sidebar-item svg {
  width: 16px;
  height: 16px;
  color: inherit;
  opacity: 0.7;
  flex-shrink: 0;
  transition: opacity 0.2s;
}
.sidebar-item.active svg { 
  opacity: 1; 
  color: var(--text-primary); 
  filter: drop-shadow(0 0 6px rgba(255,255,255,0.15));
}

/* Main content */
.main {
  flex: 1;
  padding: 0 44px 44px;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg-primary);
}

.page { display: none; animation: fadeIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
.page.active { display: block; transform-origin: center top; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px) scale(0.995); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.page-title {
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 32px;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}

/* Stats grid */
.stats-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 40px;
}
.stat-box {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 22px 24px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: transform 0.2s, box-shadow 0.2s;
}
.stat-box:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.stat-value {
  font-size: 34px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.8px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  margin-bottom: 8px;
}
.stat-value .stat-unit {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 4px;
}
.stat-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

/* Groups / sections */
.group { margin-bottom: 32px; }
.group-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 12px;
  padding-left: 4px;
}
.group-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.03);
}
.group-row {
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
  transition: background 0.2s;
}
.group-row:last-child { border-bottom: none; }

.row-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Form elements */
.field-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.field-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 6px;
  line-height: 1.5;
}

input[type="password"],
input[type="text"],
textarea,
select {
  width: 100%;
  padding: 12px 14px;
  background: var(--bg-input);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: all 0.2s;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
}
input:focus, textarea:focus, select:focus {
  border-color: var(--accent);
  background: var(--bg-secondary);
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.1), 0 0 0 3px var(--accent-soft);
}
::placeholder { color: rgba(255, 255, 255, 0.2); }
textarea {
  resize: vertical;
  line-height: 1.5;
  min-height: 80px;
}

/* Toggle switch (iOS style) */
.toggle {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}
.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.toggle .slider {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  cursor: pointer;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
}
.toggle .slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  left: 2px;
  top: 2px;
  background: #ffffff;
  border-radius: 50%;
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  box-shadow: 0 2px 5px rgba(0,0,0,0.3), 0 1px 1px rgba(0,0,0,0.1);
}
.toggle input:checked + .slider { background: var(--green); }
.toggle input:checked + .slider::before { transform: translateX(20px); }

/* Status dot */
.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.s-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 10px rgba(48, 209, 88, 0.3);
}
.s-dot.on { background: var(--green); box-shadow: 0 0 12px rgba(48, 209, 88, 0.4); }
.s-dot.off { background: var(--red); box-shadow: 0 0 12px rgba(255, 69, 58, 0.4); }
.s-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

/* Badge */
.badge {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  flex-shrink: 0;
  letter-spacing: 0.2px;
}
.badge-green { background: rgba(48, 209, 88, 0.15); color: var(--green); border: 1px solid rgba(48, 209, 88, 0.2); }
.badge-accent { background: var(--accent-soft); color: var(--accent); border: 1px solid rgba(94, 92, 230, 0.2); }
.badge-orange { background: rgba(255, 159, 10, 0.15); color: var(--orange); border: 1px solid rgba(255, 159, 10, 0.2); }

/* Language chips */
.lang-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.lang-chip {
  font-size: 13px; font-weight: 500; padding: 6px 14px; border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary); cursor: pointer; transition: all 0.2s;
  user-select: none;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}
.lang-chip:hover { background: rgba(255, 255, 255, 0.08); color: var(--text-primary); }
.lang-chip.selected {
  background: var(--accent-soft); border-color: rgba(94, 92, 230, 0.4); color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(94, 92, 230, 0.25);
}
.lang-chip.auto-chip.selected {
  background: rgba(48, 209, 88, 0.15); border-color: rgba(48, 209, 88, 0.4); color: var(--text-primary);
}

/* Keyboard shortcut badge */
.kbd {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: var(--bg-tertiary);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  box-shadow: 0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05);
  letter-spacing: 0.5px;
}

/* Steps / feature list */
.step {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.step:last-child { border-bottom: none; }
.step-n {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--bg-tertiary);
  border: 1px solid rgba(255,255,255,0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  flex-shrink: 0;
  margin-top: -2px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}

/* History */
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.btn-text {
  padding: 8px 16px;
  background: var(--bg-secondary);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}
.btn-text:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: var(--bg-tertiary);
  transform: translateY(-1px);
}
.btn-danger:hover {
  border-color: rgba(255, 69, 58, 0.4) !important;
  color: var(--red) !important;
  background: rgba(255, 69, 58, 0.1) !important;
}

.h-entry {
  background: var(--bg-secondary);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.h-entry:hover { 
  background: var(--bg-tertiary); 
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.15);
}
.h-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}
.h-text {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
}
.h-raw {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 8px;
  line-height: 1.4;
  padding-top: 8px;
  border-top: 1px dashed rgba(255,255,255,0.08);
}
.h-empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 80px 20px;
  font-size: 14px;
  line-height: 1.6;
}

/* Version footer */
.version {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 28px 0 8px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%) translateY(40px) scale(0.95);
  background: rgba(24, 24, 28, 0.9);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  padding: 12px 26px;
  border-radius: 30px;
  font-size: 14px;
  font-weight: 500;
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
  z-index: 100;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
}
.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0) scale(1);
}

/* API key row */
.api-key-row { display: flex; gap: 10px; align-items: center; }
.api-key-row input { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; letter-spacing: 0.5px; }
.btn-icon {
  width: 42px; height: 42px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: all 0.2s; font-size: 16px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}
.btn-icon:hover { border-color: rgba(255,255,255,0.2); color: var(--text-primary); background: var(--bg-tertiary); transform: translateY(-1px); }
.btn-validate {
  padding: 0 18px; height: 42px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--bg-secondary); color: var(--text-primary); cursor: pointer;
  font-size: 13px; font-family: inherit; font-weight: 600; flex-shrink: 0;
  transition: all 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}
.btn-validate:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); transform: translateY(-1px); }
.btn-validate.loading { opacity: 0.5; pointer-events: none; }
.btn-validate.valid { border-color: var(--green); color: var(--green); background: rgba(48, 209, 88, 0.1); }
.btn-validate.invalid { border-color: var(--red); color: var(--red); background: rgba(255, 69, 58, 0.1); }

/* History search */
.history-search {
  width: 100%; padding: 14px 18px; margin-bottom: 16px;
  background: var(--bg-input); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px;
  color: var(--text-primary); font-size: 14px; font-family: inherit; outline: none;
  box-shadow: inset 0 2px 5px rgba(0,0,0,0.15); transition: all 0.2s;
}
.history-search:focus { border-color: var(--accent); box-shadow: inset 0 2px 5px rgba(0,0,0,0.1), 0 0 0 3px var(--accent-soft); }
.history-count { font-size: 12px; font-weight: 500; color: var(--text-tertiary); margin-bottom: 16px; }
.btn-load-more {
  width: 100%; padding: 14px; margin-top: 16px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--bg-secondary);
  color: var(--text-primary); font-size: 13px; font-weight: 600; font-family: inherit;
  cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.btn-load-more:hover { border-color: rgba(255,255,255,0.2); background: var(--bg-tertiary); transform: translateY(-1px); }

/* Copy flash */
.h-entry.copied { background: rgba(48, 209, 88, 0.12) !important; border-color: rgba(48, 209, 88, 0.3) !important; transform: scale(1.01); }
.h-entry .copied-label {
  display: none; font-size: 12px; color: var(--green); font-weight: 600; padding: 3px 8px; background: rgba(48, 209, 88, 0.15); border-radius: 4px;
}
.h-entry.copied .copied-label { display: inline-flex; }

/* Scrollbar */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; border: 2px solid var(--bg-primary); }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
</style>

</head>
<body>

<div class="drag-region"></div>

<div class="layout">
  <div class="sidebar">
    <div class="sidebar-brand">
      ${brandLogo(22)}
      <span class="sidebar-brand-name" style="font-size: 15px; margin-left: 2px;">VoiceFlow</span>
    </div>

    <div class="sidebar-item active" data-page="overview">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A1.5 1.5 0 013.5 1h3A1.5 1.5 0 018 2.5v3A1.5 1.5 0 016.5 7h-3A1.5 1.5 0 012 5.5v-3zm7 0A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm-7 7A1.5 1.5 0 013.5 8h3A1.5 1.5 0 018 9.5v3A1.5 1.5 0 016.5 14h-3A1.5 1.5 0 012 12.5v-3zm7 0A1.5 1.5 0 0110.5 8h3a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 019 12.5v-3z"/></svg>
      Overview
    </div>
    <div class="sidebar-item" data-page="dictionary">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 2v12a1 1 0 001 1h8a1 1 0 001-1V2a1 1 0 00-1-1H4a1 1 0 00-1 1zm2 1.5A.5.5 0 015.5 3h5a.5.5 0 010 1h-5a.5.5 0 01-.5-.5zm0 3A.5.5 0 015.5 6h5a.5.5 0 010 1h-5a.5.5 0 01-.5-.5zm0 3A.5.5 0 015.5 9h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5z"/></svg>
      Dictionary
    </div>
    <div class="sidebar-item" data-page="history">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 107 7A7 7 0 008 1zm0 12.5A5.5 5.5 0 1113.5 8 5.506 5.506 0 018 13.5zM8.5 4v4.25l3.5 2.08-.75 1.23L7 9V4h1.5z"/></svg>
      History
    </div>

    <div class="sidebar-section">Settings</div>
    <div class="sidebar-item" data-page="general">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 10a2 2 0 100-4 2 2 0 000 4zm6.32-1.906l-1.076-.606a5.453 5.453 0 000-1.776l1.076-.606a.5.5 0 00.196-.66l-1-1.732a.5.5 0 00-.622-.22l-1.158.457a5.5 5.5 0 00-1.538-.888L10 1.5a.5.5 0 00-.5-.5h-2a.5.5 0 00-.5.5v1.063a5.5 5.5 0 00-1.538.888L4.304 3a.5.5 0 00-.622.22l-1 1.732a.5.5 0 00.196.66l1.076.606a5.453 5.453 0 000 1.776l-1.076.606a.5.5 0 00-.196.66l1 1.732a.5.5 0 00.622.22l1.158-.457c.467.383.988.69 1.538.888V13.5a.5.5 0 00.5.5h2a.5.5 0 00.5-.5v-1.063a5.5 5.5 0 001.538-.888l1.158.457a.5.5 0 00.622-.22l1-1.732a.5.5 0 00-.196-.66z"/></svg>
      General
    </div>
    <div class="sidebar-item" data-page="dictation">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3zM3 7a1 1 0 00-2 0 7 7 0 006 6.93V15H5.5a.5.5 0 000 1h5a.5.5 0 000-1H9v-1.07A7 7 0 0015 7a1 1 0 00-2 0 5 5 0 01-10 0z"/></svg>
      Dictation & AI
    </div>
    <div class="sidebar-item" data-page="shortcuts">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3A1.5 1.5 0 013 1.5h10A1.5 1.5 0 0114.5 3v7a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 10V3zM3 2.5a.5.5 0 00-.5.5v7a.5.5 0 00.5.5h10a.5.5 0 00.5-.5V3a.5.5 0 00-.5-.5H3zm1 2a.5.5 0 01.5-.5h1a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5v-1zm4 0a.5.5 0 01.5-.5h1a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5v-1zm-4 3a.5.5 0 01.5-.5h7a.5.5 0 01.5.5v1a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5v-1zM5 13.5a.5.5 0 000 1h6a.5.5 0 000-1H5z"/></svg>
      Shortcuts
    </div>

    <div class="sidebar-section">Other</div>
    <div class="sidebar-item" data-page="about">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 107 7A7 7 0 008 1zm0 12.5A5.5 5.5 0 1113.5 8 5.506 5.506 0 018 13.5zM7.25 5a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM7 7.5a.5.5 0 01.5-.5h1a.5.5 0 01.5.5v3.5h.5a.5.5 0 010 1h-2a.5.5 0 010-1H8V8h-.5a.5.5 0 01-.5-.5z"/></svg>
      About
    </div>
  </div>

  <div class="main">
    <!-- ==================== Overview ==================== -->
    <div class="page active" id="page-overview">
      <div class="hero-banner" style="background: linear-gradient(135deg, rgba(94, 92, 230, 0.45), rgba(41, 39, 92, 0.2), transparent);">
        <div class="hero-title">Speak naturally,<br>write perfectly.</div>
        <div class="hero-subtitle">You are successfully connected to Voiceflow. Simply hold Option ⌥ to start dictating in any application.</div>
      </div>
      <div class="page-title" style="margin-bottom:16px;">Productivity</div>

      <div class="stats-row">
        <div class="stat-box">
          <div class="stat-value">${stats.totalSessions}</div>
          <div class="stat-label">Dictations</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${stats.totalWords.toLocaleString()}</div>
          <div class="stat-label">Words Dictated</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${timeSavedMin > 0 ? timeSavedMin : '—'}<span class="stat-unit">${timeSavedMin > 0 ? 'min' : ''}</span></div>
          <div class="stat-label">Time Saved</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${stats.avgWpm > 0 ? stats.avgWpm : '—'}<span class="stat-unit">${stats.avgWpm > 0 ? 'wpm' : ''}</span></div>
          <div class="stat-label">Avg. Dictation Speed</div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">Status</div>
        <div class="group-content">
          <div class="status-row">
            <span class="s-dot ${hasKey ? 'on' : 'off'}"></span>
            <span class="s-text">${hasKey ? 'Ready — API key configured' : 'Setup required — add API key in General settings'}</span>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">Quick Start</div>
        <div class="group-content">
          <div class="step">
            <div class="step-n">1</div>
            <div>Place your cursor in any text field, in any app</div>
          </div>
          <div class="step">
            <div class="step-n">2</div>
            <div>Hold <span class="kbd">⌥ Option</span> and speak naturally — any language</div>
          </div>
          <div class="step">
            <div class="step-n">3</div>
            <div>Release to transcribe, clean up, and paste into your cursor position</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== General ==================== -->
    <div class="page" id="page-general">
      <div class="page-title">General</div>

      <div class="group">
        <div class="group-label">API</div>
        <div class="group-content">
          <div class="group-row">
            <div class="field-label">OpenAI API Key</div>
            <div class="api-key-row">
              <input type="password" id="openaiKey" placeholder="sk-proj-..." value="${safeApiKey}" spellcheck="false" autocomplete="off" />
              <button class="btn-icon" id="toggleKeyVis" title="Show/hide key">👁</button>
              <button class="btn-validate" id="validateKey">Verify</button>
            </div>
            <div class="field-hint">Powers both Whisper (speech-to-text) and GPT-4o-mini (text cleanup). This is the only API you need.</div>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">Startup</div>
        <div class="group-content">
          <div class="group-row row-flex">
            <div>
              <div class="field-label" style="margin-bottom:0;">Launch at Login</div>
              <div class="field-hint" style="margin-top:3px;">Automatically start VoiceFlow when you log in</div>
            </div>
            <label class="toggle">
              <input type="checkbox" id="autoStart" ${autoStartOn ? 'checked' : ''} />
              <span class="slider"></span>
            </label>
          </div>
          <div class="group-row row-flex">
            <div>
              <div class="field-label" style="margin-bottom:0;">Sound Feedback</div>
              <div class="field-hint" style="margin-top:3px;">Play sounds when recording starts, stops, and completes</div>
            </div>
            <label class="toggle">
              <input type="checkbox" id="soundFeedback" ${soundOn ? 'checked' : ''} />
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">Microphone</div>
        <div class="group-content">
          <div class="group-row row-flex">
            <div>
              <div class="field-label" style="margin-bottom:0;">Input Device</div>
              <div class="field-hint" style="margin-top:3px;">Also configurable from the menu bar icon</div>
            </div>
            <span class="badge badge-green" id="micBadge">System Default</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== Dictation ==================== -->
    <div class="page" id="page-dictation">
      <div class="page-title">Dictation</div>

      <div class="group">
        <div class="group-label">Language</div>
        <div class="group-content">
          <div class="group-row row-flex" style="cursor:pointer;" onclick="showSubpage('page-language')">
            <div>
              <div class="field-label" style="margin-bottom:0;">Preferred Languages</div>
              <div class="field-hint" style="margin-top:4px; font-weight:500; color:var(--text-secondary);" id="langSummary">Auto (100+)</div>
            </div>
            <div style="color:var(--text-tertiary); font-size:20px; font-weight:300; margin-right:4px;">›</div>
          </div>

        </div>
      </div>

      <div class="group">
        <div class="group-label">AI Processing</div>
        <div class="group-content">
          <div class="group-row row-flex">
            <div style="flex:1;">
              <div class="field-label" style="margin-bottom:0;">Context-Aware Formatting</div>
              <div class="field-hint" style="margin-top:3px;">Adapts tone to the active app — professional for email, casual for chat, technical for code editors.</div>
            </div>
            <span class="badge badge-green">On</span>
          </div>
          <div class="group-row row-flex">
            <div style="flex:1;">
              <div class="field-label" style="margin-bottom:0;">Auto-Editing</div>
              <div class="field-hint" style="margin-top:3px;">Removes filler words, fixes self-corrections, adds punctuation, and formats lists.</div>
            </div>
            <span class="badge badge-green">On</span>
          </div>
          <div class="group-row row-flex">
            <div style="flex:1;">
              <div class="field-label" style="margin-bottom:0;">AI Model</div>
              <div class="field-hint" style="margin-top:3px;">Used for text cleanup and formatting.</div>
            </div>
            <span class="badge badge-accent">GPT-4o-mini</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Subpage: Language -->
    <div class="page" id="page-language">
      <div class="row-flex" style="margin-bottom: 32px;">
        <button class="btn-icon" onclick="showSubpage('page-dictation')" style="width:36px;height:36px;background:transparent;border:none;box-shadow:none;font-size:24px;padding-bottom:4px;color:var(--text-secondary);">‹</button>
        <div class="page-title" style="margin-bottom:0;text-align:center;flex:1;font-size:18px;">Select Languages</div>
        <div style="width:36px;"></div>
      </div>

      <div class="group">
        <div class="group-content">
          <div class="group-row">
            <div class="field-hint" style="margin-top:0; margin-bottom:14px; font-size: 13px;">Select the languages you speak. Fewer languages = more accurate detection. "Auto" detects from 100+ languages but may be slightly slower.</div>
            <div class="lang-chips" id="langChips">
              <div class="lang-chip auto-chip" data-lang="auto">Auto (100+)</div>
              <div class="lang-chip" data-lang="en">English</div>
              <div class="lang-chip" data-lang="zh">中文</div>
              <div class="lang-chip" data-lang="ja">日本語</div>
              <div class="lang-chip" data-lang="ko">한국어</div>
              <div class="lang-chip" data-lang="es">Español</div>
              <div class="lang-chip" data-lang="fr">Français</div>
              <div class="lang-chip" data-lang="de">Deutsch</div>
              <div class="lang-chip" data-lang="pt">Português</div>
              <div class="lang-chip" data-lang="it">Italiano</div>
              <div class="lang-chip" data-lang="ru">Русский</div>
              <div class="lang-chip" data-lang="ar">العربية</div>
              <div class="lang-chip" data-lang="hi">हिन्दी</div>
              <div class="lang-chip" data-lang="th">ไทย</div>
              <div class="lang-chip" data-lang="vi">Tiếng Việt</div>
              <div class="lang-chip" data-lang="tr">Türkçe</div>
              <div class="lang-chip" data-lang="nl">Nederlands</div>
              <div class="lang-chip" data-lang="pl">Polski</div>
              <div class="lang-chip" data-lang="sv">Svenska</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Subpage: Dictionary -->
    <div class="page" id="page-dictionary">
      <div class="row-flex" style="margin-bottom: 32px;">
        <button class="btn-icon" onclick="showSubpage('page-dictation')" style="width:36px;height:36px;background:transparent;border:none;box-shadow:none;font-size:24px;padding-bottom:4px;color:var(--text-secondary);">‹</button>
        <div class="page-title" style="margin-bottom:0;text-align:center;flex:1;font-size:18px;">Custom Dictionary</div>
        <div style="width:36px;"></div>
      </div>

      <div class="group">
        <div class="group-content" style="padding:14px;">
          <textarea id="dictionary" rows="12" placeholder="VoiceFlow&#10;Claude&#10;Notion&#10;WisprFlow" spellcheck="false" style="border:none;background:transparent;box-shadow:none;padding:8px;resize:none;font-size:15px;line-height:1.6;">${safeDictionary}</textarea>
        </div>
        <div class="field-hint" style="margin-top:16px;text-align:center;">One word per line. Names, brands, or technical terms that VoiceFlow should always preserve exactly as-is.</div>
      </div>
    </div>

    <!-- ==================== Shortcuts ==================== -->
    <div class="page" id="page-shortcuts">
      <div class="page-title">Shortcuts</div>

      <div class="group">
        <div class="group-label">Voice Input</div>
        <div class="group-content">
          <div class="group-row row-flex">
            <div>
              <div class="field-label" style="margin-bottom:0;">Hold to Talk</div>
              <div class="field-hint" style="margin-top:3px;">Hold the key, speak, release to transcribe and paste</div>
            </div>
            <span class="kbd">⌥ Option</span>
          </div>
          <div class="group-row row-flex">
            <div>
              <div class="field-label" style="margin-bottom:0;">Toggle Recording</div>
              <div class="field-hint" style="margin-top:3px;">Tap once to start, tap again to stop</div>
            </div>
            <span class="kbd">⌥ Option</span>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">Other</div>
        <div class="group-content">
          <div class="group-row row-flex">
            <div>
              <div class="field-label" style="margin-bottom:0;">Open Settings</div>
              <div class="field-hint" style="margin-top:3px;">Right-click the floating bar</div>
            </div>
            <span class="badge badge-accent">Right Click</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== History ==================== -->
    <div class="page" id="page-history">
      <div class="history-header">
        <div class="page-title" style="margin-bottom:0;">History</div>
        <button class="btn-text btn-danger" id="clearHistory">Clear All</button>
      </div>
      <input type="text" class="history-search" id="historySearch" placeholder="Search dictations..." spellcheck="false" />
      <div class="history-count" id="historyCount"></div>
      <div id="historyList">
        <div class="h-empty">No dictations yet.<br>Your transcription history will appear here.</div>
      </div>
    </div>

    <!-- ==================== About ==================== -->
    <div class="page" id="page-about">
      <div class="page-title">About</div>

      <div class="group">
        <div class="group-content">
          <div class="group-row" style="text-align:center; padding:30px 14px 24px;">
            <div style="display:flex;justify-content:center;margin-bottom:14px;">${brandLogo(32)}</div>
            <div style="font-size:24px; font-weight:700; letter-spacing:-0.5px; margin-bottom:3px;">VoiceFlow</div>
            <div style="font-size:12px; color:var(--text-tertiary); letter-spacing:0.5px;">Voice-to-text for macOS</div>
            <div style="font-size:11px; color:var(--text-tertiary); margin-top:6px; opacity:0.5;">v${appVersion}</div>
          </div>
          <div class="group-row row-flex">
            <span class="field-label" style="margin-bottom:0;">Architecture</span>
            <span style="font-size:12px; color:var(--text-secondary);">Whisper + GPT-4o-mini</span>
          </div>
          <div class="group-row row-flex">
            <span class="field-label" style="margin-bottom:0;">Platform</span>
            <span style="font-size:12px; color:var(--text-secondary);">macOS (Electron)</span>
          </div>
          <div class="group-row row-flex">
            <span class="field-label" style="margin-bottom:0;">Privacy</span>
            <span style="font-size:12px; color:var(--text-secondary);">Audio processed via API, never stored</span>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">Features</div>
        <div class="group-content">
          <div class="step"><div class="step-n" style="background:var(--accent-soft); color:var(--accent);">1</div><div>100+ languages with smart detection</div></div>
          <div class="step"><div class="step-n" style="background:var(--accent-soft); color:var(--accent);">2</div><div>Context-aware — adapts to email, chat, code, notes</div></div>
          <div class="step"><div class="step-n" style="background:var(--accent-soft); color:var(--accent);">3</div><div>Intelligent editing — fillers, grammar, punctuation</div></div>
          <div class="step"><div class="step-n" style="background:var(--accent-soft); color:var(--accent);">4</div><div>Auto-retry on translation errors</div></div>
          <div class="step"><div class="step-n" style="background:var(--accent-soft); color:var(--accent);">5</div><div>Private — audio processed via API, never stored</div></div>
          <div class="step"><div class="step-n" style="background:var(--accent-soft); color:var(--accent);">6</div><div>~2-3 seconds end-to-end</div></div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">Cost Estimate</div>
        <div class="group-content">
          <div class="group-row row-flex">
            <span style="font-size:13px; color:var(--text-secondary);">Per dictation</span>
            <span style="font-size:13px; color:var(--text-primary); font-weight:500;">~$0.001</span>
          </div>
          <div class="group-row row-flex">
            <span style="font-size:13px; color:var(--text-secondary);">100 dictations/day</span>
            <span style="font-size:13px; color:var(--text-primary); font-weight:500;">~$7/month</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="toast" id="toast">Saved</div>

<script>
const { ipcRenderer } = require('electron');

// Navigation
function showSubpage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

document.querySelectorAll('.sidebar-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    const pageId = 'page-' + item.dataset.page;
    document.getElementById(pageId).classList.add('active');
    if (item.dataset.page === 'history') loadHistory();
    if (item.dataset.page === 'overview') refreshStats();
  });
});

// Save helper
function save(obj) {
  ipcRenderer.invoke('settings:set', obj).then(() => {
    const t = document.getElementById('toast');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1200);
  });
}

function esc(s) { return s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }

// --- Settings inputs ---
document.getElementById('openaiKey').addEventListener('change', e => save({ openaiApiKey: e.target.value }));
document.getElementById('dictionary').addEventListener('change', e => {
  save({ customDictionary: e.target.value.split('\\n').map(w => w.trim()).filter(Boolean) });
});
document.getElementById('soundFeedback').addEventListener('change', e => save({ soundFeedback: e.target.checked }));
document.getElementById('autoStart').addEventListener('change', e => save({ autoStart: e.target.checked }));

// --- API Key show/hide ---
document.getElementById('toggleKeyVis').addEventListener('click', () => {
  const inp = document.getElementById('openaiKey');
  const isPassword = inp.type === 'password';
  inp.type = isPassword ? 'text' : 'password';
  document.getElementById('toggleKeyVis').textContent = isPassword ? '🙈' : '👁';
});

// --- API Key validation ---
document.getElementById('validateKey').addEventListener('click', async () => {
  const btn = document.getElementById('validateKey');
  const key = document.getElementById('openaiKey').value;
  if (!key) { btn.textContent = 'Enter a key first'; btn.className = 'btn-validate invalid'; return; }
  btn.textContent = 'Verifying...';
  btn.className = 'btn-validate loading';
  const result = await ipcRenderer.invoke('settings:validate-api-key', key);
  if (result.valid) {
    btn.textContent = 'Valid';
    btn.className = 'btn-validate valid';
  } else {
    btn.textContent = result.error || 'Invalid';
    btn.className = 'btn-validate invalid';
  }
  setTimeout(() => { btn.textContent = 'Verify'; btn.className = 'btn-validate'; }, 3000);
});

// --- Language chips ---
(function() {
  const preferred = ${JSON.stringify(preferredLangs)};
  const chips = document.querySelectorAll('.lang-chip');

  function updateUI() {
    chips.forEach(c => {
      c.classList.toggle('selected', preferred.includes(c.dataset.lang));
    });
    const summary = document.getElementById('langSummary');
    if (summary) {
      if (preferred.includes('auto')) { summary.textContent = 'Auto (100+)'; summary.style.color = 'var(--text-secondary)'; }
      else { 
        summary.textContent = preferred.map(p => { const el = document.querySelector('.lang-chip[data-lang="' + p + '"]'); return (el && el.textContent) || p; }).join(', ');
        summary.style.color = 'var(--accent)';
      }
    }
  }
  updateUI();

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const lang = chip.dataset.lang;
      if (lang === 'auto') {
        preferred.length = 0;
        preferred.push('auto');
      } else {
        const autoIdx = preferred.indexOf('auto');
        if (autoIdx !== -1) preferred.splice(autoIdx, 1);
        const idx = preferred.indexOf(lang);
        if (idx !== -1) {
          preferred.splice(idx, 1);
          if (preferred.length === 0) preferred.push('auto');
        } else {
          preferred.push(lang);
        }
      }
      updateUI();
      save({ preferredLanguages: [...preferred] });
    });
  });
  updateUI();
})();

// --- Overview stats live refresh ---
async function refreshStats() {
  const stats = await ipcRenderer.invoke('history:stats');
  if (!stats) return;
  const boxes = document.querySelectorAll('.stat-box');
  if (boxes[0]) boxes[0].querySelector('.stat-value').textContent = stats.totalSessions;
  if (boxes[1]) boxes[1].querySelector('.stat-value').textContent = stats.totalWords.toLocaleString();
  if (boxes[2]) {
    const min = Math.round(stats.timeSavedMs / 60000);
    boxes[2].querySelector('.stat-value').innerHTML = min > 0 ? min + '<span class="stat-unit">min</span>' : '\\u2014';
  }
  if (boxes[3]) {
    boxes[3].querySelector('.stat-value').innerHTML = stats.avgWpm > 0 ? stats.avgWpm + '<span class="stat-unit">wpm</span>' : '\\u2014';
  }
}

// --- History with search + copy feedback + load more ---
let allEntries = [];
let historyLimit = 50;

async function loadHistory() {
  allEntries = await ipcRenderer.invoke('history:get', 500) || [];
  historyLimit = 50;
  document.getElementById('historySearch').value = '';
  renderHistory();
}

function renderHistory() {
  const query = (document.getElementById('historySearch').value || '').toLowerCase();
  const filtered = query
    ? allEntries.filter(e => (e.processedText || '').toLowerCase().includes(query) || (e.rawText || '').toLowerCase().includes(query) || (e.app || '').toLowerCase().includes(query))
    : allEntries;

  const list = document.getElementById('historyList');
  const countEl = document.getElementById('historyCount');

  if (filtered.length === 0) {
    list.innerHTML = '<div class="h-empty">' + (query ? 'No results for "' + esc(query) + '"' : 'No dictations yet.<br>Your transcription history will appear here.') + '</div>';
    countEl.textContent = '';
    return;
  }

  const showing = filtered.slice(0, historyLimit);
  countEl.textContent = 'Showing ' + showing.length + ' of ' + filtered.length;

  list.innerHTML = showing.map((e, i) => {
    const d = new Date(e.timestamp);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const day = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const sec = (e.durationMs / 1000).toFixed(1);
    const lang = e.language ? e.language.toUpperCase() : '';
    const words = e.wordCount || '';
    return '<div class="h-entry" data-idx="' + i + '">' +
      '<div class="h-meta">' +
        '<span>' + day + ' ' + time + '</span>' +
        '<span>' + esc(e.app) + '</span>' +
        (lang ? '<span>' + lang + '</span>' : '') +
        '<span>' + sec + 's</span>' +
        (words ? '<span>' + words + ' words</span>' : '') +
        '<span class="copied-label">Copied!</span>' +
      '</div>' +
      '<div class="h-text">' + esc(e.processedText) + '</div>' +
      (e.rawText !== e.processedText ? '<div class="h-raw">' + esc(e.rawText) + '</div>' : '') +
      '</div>';
  }).join('') + (filtered.length > historyLimit ? '<button class="btn-load-more" id="loadMore">Load More (' + (filtered.length - historyLimit) + ' remaining)</button>' : '');

  // Copy click handlers
  list.querySelectorAll('.h-entry').forEach(el => {
    el.addEventListener('click', () => {
      const text = el.querySelector('.h-text').textContent;
      navigator.clipboard.writeText(text);
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 800);
    });
  });

  // Load more
  const loadMoreBtn = document.getElementById('loadMore');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      historyLimit += 50;
      renderHistory();
    });
  }
}

document.getElementById('historySearch').addEventListener('input', () => renderHistory());

document.getElementById('clearHistory').addEventListener('click', async () => {
  if (confirm('Clear all dictation history?')) {
    await ipcRenderer.invoke('history:clear');
    loadHistory();
  }
});
</script>
</body>
</html>`

  const tmpDir = join(tmpdir(), 'voiceflow')
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
  const tmpFile = join(tmpDir, 'settings.html')
  writeFileSync(tmpFile, settingsHTML, 'utf-8')
  settingsWindow.loadFile(tmpFile)

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  return settingsWindow
}

export function getFloatingBarWindow(): BrowserWindow | null {
  return floatingBarWindow
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow
}
