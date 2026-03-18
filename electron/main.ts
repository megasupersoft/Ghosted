import { app, BrowserWindow, dialog, ipcMain, shell, nativeImage, protocol, net } from 'electron'
import { execSync, execFileSync } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'

const isDev = !app.isPackaged
const VITE_DEV_SERVER = 'http://localhost:5173'

// Set the app name so macOS menu bar and dock say "Ghosted" instead of "Electron"
app.setName('Ghosted')

function getAppIcon(): Electron.NativeImage | undefined {
  // Try PNG first, then SVG
  const candidates = isDev
    ? [path.join(__dirname, '../build/icon.png'), path.join(__dirname, '../build/icon.svg'), path.join(__dirname, '../public/ghost.svg')]
    : [path.join(__dirname, '../dist/icon.png'), path.join(__dirname, '../dist/ghost.svg')]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return nativeImage.createFromPath(p)
    } catch {}
  }
  return undefined
}

function createWindow() {
  const icon = getAppIcon()

  const win = new BrowserWindow({
    title: 'Ghosted',
    icon,
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

  // Override macOS dock icon
  if (process.platform === 'darwin' && icon && app.dock) {
    app.dock.setIcon(icon)
  }

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

ipcMain.handle('pty:create', (_e, id: string, cwd: string, cols?: number, rows?: number) => {
  if (!pty) return false
  const sh = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash')
  const t = pty.spawn(sh, [], {
    name: 'xterm-256color', cols: cols || 80, rows: rows || 24,
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

// ── Git IPC ──
function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 30000 }).trim()
}

ipcMain.handle('gh:run', async (_e, cwd: string, args: string) => {
  try {
    // Use execFileSync with shell:false to avoid $ being interpreted by the shell
    // Split args respecting quoted strings
    const parsed = parseArgs(args)
    const result = execFileSync('gh', parsed, { cwd, encoding: 'utf-8', timeout: 15000 }).trim()
    return { ok: true, data: result }
  } catch (err: any) { return { ok: false, error: err.message } }
})

function parseArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (current) { args.push(current); current = '' }
      continue
    }
    current += ch
  }
  if (current) args.push(current)
  return args
}

ipcMain.handle('git:log', async (_e, cwd: string, count: number = 50) => {
  try {
    const SEP = '<<GH_SEP>>'
    const fmt = ['%H', '%h', '%an', '%ae', '%ar', '%s', '%D', '%P'].join(SEP)
    const raw = git(cwd, ['log', `--format=${fmt}`, '--all', '-n', String(count)])
    if (!raw) return []
    return raw.split('\n').filter(Boolean).map(line => {
      const [hash, shortHash, author, email, date, subject, refs, parents] = line.split(SEP)
      return { hash, shortHash, author, email, date, subject, refs, parents: parents?.split(' ').filter(Boolean) ?? [] }
    })
  } catch { return [] }
})

ipcMain.handle('git:status', async (_e, cwd: string) => {
  try {
    const raw = git(cwd, ['status', '--porcelain=v1', '-uall'])
    if (!raw) return []
    return raw.split('\n').map(line => {
      const x = line[0]
      const y = line[1]
      const filePath = line.slice(3)
      return { x, y, path: filePath }
    })
  } catch { return [] }
})

ipcMain.handle('git:branch', async (_e, cwd: string) => {
  try { return git(cwd, ['branch', '--show-current']) } catch { return '' }
})

ipcMain.handle('git:diffSummary', async (_e, cwd: string) => {
  try {
    let diff = ''
    try { diff = git(cwd, ['diff', '--cached', '--stat']) } catch {}
    if (!diff) try { diff = git(cwd, ['diff', '--stat']) } catch {}
    let untracked = ''
    try { untracked = git(cwd, ['ls-files', '--others', '--exclude-standard']) } catch {}
    return { diff, untracked }
  } catch { return { diff: '', untracked: '' } }
})

ipcMain.handle('git:remote', async (_e, cwd: string) => {
  try {
    const url = git(cwd, ['remote', 'get-url', 'origin'])
    const ssh = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (ssh) return { owner: ssh[1], repo: ssh[2] }
    return null
  } catch { return null }
})

ipcMain.handle('git:stage', async (_e, cwd: string, filePath: string) => {
  try { git(cwd, ['add', '--', filePath]); return true } catch { return false }
})

ipcMain.handle('git:unstage', async (_e, cwd: string, filePath: string) => {
  try { git(cwd, ['reset', 'HEAD', '--', filePath]); return true } catch { return false }
})

ipcMain.handle('git:stageAll', async (_e, cwd: string) => {
  try { git(cwd, ['add', '-A']); return { ok: true } }
  catch (err: any) { return { ok: false, error: err.stderr || err.message } }
})

ipcMain.handle('git:commit', async (_e, cwd: string, message: string) => {
  try { git(cwd, ['commit', '-m', message]); return { ok: true } }
  catch (err: any) {
    const stderr = typeof err.stderr === 'string' ? err.stderr.trim() : ''
    const stdout = typeof err.stdout === 'string' ? err.stdout.trim() : ''
    return { ok: false, error: stderr || stdout || err.message }
  }
})

ipcMain.handle('git:push', async (_e, cwd: string) => {
  try { git(cwd, ['push']); return { ok: true } }
  catch (err: any) { return { ok: false, error: (err.stderr || err.stdout || err.message || '').toString().trim() } }
})

ipcMain.handle('git:pull', async (_e, cwd: string) => {
  try { git(cwd, ['pull']); return { ok: true } }
  catch (err: any) { return { ok: false, error: (err.stderr || err.stdout || err.message || '').toString().trim() } }
})

ipcMain.handle('git:discard', async (_e, cwd: string, filePath: string) => {
  try { git(cwd, ['checkout', '--', filePath]); return true } catch { return false }
})

// Register protocol to serve local files (images, videos) to the renderer
protocol.registerSchemesAsPrivileged([
  { scheme: 'ghosted-file', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
])

app.whenReady().then(() => {
  protocol.handle('ghosted-file', (request) => {
    const filePath = decodeURIComponent(request.url.replace('ghosted-file://', ''))
    return net.fetch(`file://${filePath}`)
  })
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
