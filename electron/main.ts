import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'

const isDev = !app.isPackaged
const VITE_DEV_SERVER = 'http://localhost:5173'

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#09090e',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (isDev) {
    win.loadURL(VITE_DEV_SERVER)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// ── File system IPC ──
ipcMain.handle('fs:readdir', async (_e, dirPath: string) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  return entries.map(e => ({
    name: e.name,
    path: path.join(dirPath, e.name),
    isDirectory: e.isDirectory(),
  }))
})
ipcMain.handle('fs:readfile', async (_e, filePath: string) => fs.readFileSync(filePath, 'utf-8'))
ipcMain.handle('fs:writefile', async (_e, filePath: string, content: string) => {
  fs.writeFileSync(filePath, content, 'utf-8')
  return true
})
ipcMain.handle('fs:homedir', () => os.homedir())
ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
ipcMain.handle('dialog:openFolder', async () => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Open Workspace',
  })
  return result.canceled ? null : result.filePaths[0]
})

// ── Terminal IPC (node-pty) ──
let pty: typeof import('node-pty') | null = null
try { pty = require('node-pty') } catch {}

const terminals = new Map<string, import('node-pty').IPty>()

ipcMain.handle('pty:create', (_e, id: string, cwd: string) => {
  if (!pty) return false
  const sh = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash')
  const t = pty.spawn(sh, [], {
    name: 'xterm-256color', cols: 80, rows: 24,
    cwd: cwd || os.homedir(),
    env: process.env as Record<string, string>,
  })
  terminals.set(id, t)
  const win = BrowserWindow.getFocusedWindow()
  t.onData(data => win?.webContents.send(`pty:data:${id}`, data))
  t.onExit(() => win?.webContents.send(`pty:exit:${id}`))
  return true
})
ipcMain.handle('pty:write', (_e, id: string, data: string) => terminals.get(id)?.write(data))
ipcMain.handle('pty:resize', (_e, id: string, cols: number, rows: number) => terminals.get(id)?.resize(cols, rows))
ipcMain.handle('pty:kill', (_e, id: string) => { terminals.get(id)?.kill(); terminals.delete(id) })

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
