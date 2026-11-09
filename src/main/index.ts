import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { forgetWindow, registerProjectIpc } from './projectFs'
import { registerRunIpc } from './runner'
import { registerSettingsIpc } from './settings'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'VForm IDE',
    backgroundColor: '#1b1d22',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  const id = win.id

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => forgetWindow(id))

  // Links externos abrem no navegador do sistema, nunca dentro da IDE.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

void app.whenReady().then(() => {
  registerProjectIpc()
  registerRunIpc()
  registerSettingsIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
