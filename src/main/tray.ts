import { Tray, Menu, nativeImage, app, dialog } from 'electron'
import { join } from 'path'
import { createSettingsWindow, getFloatingBarWindow } from './windows'
import { getSetting, setSettings } from './settings-store'
import { APP_NAME } from '../shared/constants'

let tray: Tray | null = null

interface MicDevice {
  deviceId: string
  label: string
}

async function getInputDevices(): Promise<MicDevice[]> {
  const win = getFloatingBarWindow()
  if (!win || win.isDestroyed()) return []

  try {
    const devices: MicDevice[] = await win.webContents.executeJavaScript(`
      navigator.mediaDevices.enumerateDevices().then(devices =>
        devices
          .filter(d => d.kind === 'audioinput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone' }))
      )
    `)
    return devices
  } catch {
    return []
  }
}

async function buildAndShowMenu(): Promise<void> {
  if (!tray) return

  const devices = await getInputDevices()
  const currentMic = getSetting('micDeviceId')

  const micSubmenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'System Default',
      type: 'radio',
      checked: !currentMic,
      click: () => setSettings({ micDeviceId: '' })
    }
  ]

  if (devices.length > 0) {
    micSubmenu.push({ type: 'separator' })
    for (const dev of devices) {
      // Skip the "default" virtual device — we already have "System Default"
      if (dev.deviceId === 'default') continue
      micSubmenu.push({
        label: dev.label,
        type: 'radio',
        checked: currentMic === dev.deviceId,
        click: () => setSettings({ micDeviceId: dev.deviceId })
      })
    }
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Settings...',
      click: () => createSettingsWindow()
    },
    {
      label: 'Microphone',
      submenu: micSubmenu
    },
    { type: 'separator' },
    {
      label: `About ${APP_NAME}`,
      click: () => {
        const version = app.getVersion() || '1.0.0'
        dialog.showMessageBox({
          type: 'info',
          title: `About ${APP_NAME}`,
          message: `${APP_NAME} v${version}`,
          detail: 'AI-powered voice-to-text for macOS\n\nHold ⌥ Option to dictate.'
        })
      }
    },
    { type: 'separator' },
    {
      label: `Quit ${APP_NAME}`,
      click: () => app.quit()
    }
  ])

  tray.popUpContextMenu(contextMenu)
}

export function createTray(): Tray {
  const iconPath = join(__dirname, '../../resources/trayIconTemplate.png')
  let icon: Electron.NativeImage

  try {
    icon = nativeImage.createFromPath(iconPath)
  } catch {
    icon = nativeImage.createEmpty()
  }

  icon = icon.resize({ width: 16, height: 16 })

  tray = new Tray(icon)
  tray.setToolTip(APP_NAME)

  // Build menu dynamically on click (to get fresh device list)
  tray.on('click', () => buildAndShowMenu())
  tray.on('right-click', () => buildAndShowMenu())

  return tray
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
