import { app, BrowserWindow, dialog, ipcMain, shell, nativeImage, protocol, net } from 'electron'
import { registerGhostedDB } from './ghostdb'
import { execSync, execFileSync } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'

const isDev = !app.isPackaged
const VITE_DEV_SERVER = 'http://localhost:5173'

// Set the app name so macOS menu bar and dock say "Ghosted" instead of "Electron"
app.setName('Ghosted')

// ── Window state persistence ─────────────────────────────────────────────────
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json')

interface WindowState {
  x?: number; y?: number
  width: number; height: number
  isMaximized?: boolean
}

function loadWindowState(): WindowState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
    }
  } catch {}
  return { width: 1440, height: 900 }
}

function saveWindowState(win: BrowserWindow) {
  let state: WindowState
  if (!win.isMaximized()) {
    const bounds = win.getBounds()
    state = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, isMaximized: false }
  } else {
    // Keep previous non-maximized size so restore works
    const prev = loadWindowState()
    state = { width: prev.width, height: prev.height, x: prev.x, y: prev.y, isMaximized: true }
  }
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)) } catch {}
}

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
  const saved = loadWindowState()

  const win = new BrowserWindow({
    title: 'Ghosted',
    icon,
    width: saved.width,
    height: saved.height,
    ...(saved.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : {}),
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#09090e',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (saved.isMaximized) win.maximize()

  // Save window state on move/resize/maximize/close
  let saveTimer: ReturnType<typeof setTimeout>
  const debouncedSave = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveWindowState(win), 300)
  }
  win.on('resize', debouncedSave)
  win.on('move', debouncedSave)
  win.on('maximize', debouncedSave)
  win.on('unmaximize', debouncedSave)
  win.on('close', () => saveWindowState(win))

  // Override macOS dock icon
  if (process.platform === 'darwin' && icon && app.dock) {
    app.dock.setIcon(icon)
  }

  const loadBuilt = () => win.loadFile(path.join(__dirname, '../dist/index.html'))

  if (isDev) {
    // Check if Vite dev server is running before trying to connect
    import('http').then(http => {
      const req = http.get(VITE_DEV_SERVER, () => {
        req.destroy()
        win.loadURL(VITE_DEV_SERVER)
      })
      req.on('error', () => loadBuilt())
      req.setTimeout(1000, () => { req.destroy(); loadBuilt() })
    })
  } else {
    loadBuilt()
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
ipcMain.handle('fs:mkdir', async (_e, dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true })
  return true
})
ipcMain.handle('fs:newfile', async (_e, filePath: string, content?: string) => {
  fs.writeFileSync(filePath, content ?? '', 'utf-8')
  return true
})
ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => {
  fs.renameSync(oldPath, newPath)
  return true
})
ipcMain.handle('fs:delete', async (_e, targetPath: string) => {
  const stat = fs.statSync(targetPath)
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: true })
  } else {
    fs.unlinkSync(targetPath)
  }
  return true
})
ipcMain.handle('fs:exists', async (_e, targetPath: string) => fs.existsSync(targetPath))
ipcMain.handle('fs:stat', async (_e, targetPath: string) => {
  try {
    const stat = fs.statSync(targetPath)
    return { isDirectory: stat.isDirectory(), isFile: stat.isFile(), size: stat.size, mtime: stat.mtimeMs }
  } catch { return null }
})

// ── File watcher IPC ──
const watchers = new Map<string, fs.FSWatcher>()

ipcMain.handle('fs:watch', async (_e, dirPath: string) => {
  if (watchers.has(dirPath)) return true
  try {
    const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      if (win && filename) {
        win.webContents.send('fs:changed', { dir: dirPath, eventType, filename })
      }
    })
    watchers.set(dirPath, watcher)
    return true
  } catch { return false }
})

ipcMain.handle('fs:unwatch', async (_e, dirPath: string) => {
  const w = watchers.get(dirPath)
  if (w) { w.close(); watchers.delete(dirPath) }
  return true
})

ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
ipcMain.handle('shell:showItemInFolder', (_e, fullPath: string) => shell.showItemInFolder(fullPath))
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
// Deferred load — resolve from multiple locations
// Load node-pty — use child_process.execSync to spawn with correct libc if needed
function loadPty() {
  const ptyRoot = path.join(__dirname, '..', 'node_modules', 'node-pty')
  const nativePath = path.join(ptyRoot, 'build', 'Release', 'pty.node')
  const utilsPath = path.join(ptyRoot, 'lib', 'utils.js')

  // Patch node-pty's native loader to use absolute path (avoids relative path issues)
  try {
    const utils = require(utilsPath)
    utils.loadNativeModule = () => ({
      dir: path.dirname(nativePath) + '/',
      module: require(nativePath),
    })
    pty = require(ptyRoot)
    console.log('node-pty loaded OK')
  } catch (e: any) {
    console.error('node-pty load failed:', e.message)
  }
}
loadPty()

const terminals = new Map<string, import('node-pty').IPty>()

ipcMain.handle('pty:create', (_e, id: string, cwd: string, cols?: number, rows?: number) => {
  if (!pty) { console.error('pty:create failed — node-pty not loaded'); return false }
  // Kill existing if any (handles hot reloads)
  if (terminals.has(id)) { terminals.get(id)?.kill(); terminals.delete(id) }
  const sh = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash')
  const t = pty.spawn(sh, [], {
    name: 'xterm-256color', cols: cols || 80, rows: rows || 24,
    cwd: cwd || os.homedir(),
    env: process.env as Record<string, string>,
  })
  terminals.set(id, t)
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return false
  t.onData(data => { if (!win.isDestroyed()) win.webContents.send(`pty:data:${id}`, data) })
  t.onExit(() => { if (!win.isDestroyed()) win.webContents.send(`pty:exit:${id}`) })
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

ipcMain.handle('git:aheadBehind', async (_e, cwd: string) => {
  try {
    const raw = git(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])
    const [ahead, behind] = raw.split(/\s+/).map(Number)
    return { ahead: ahead || 0, behind: behind || 0 }
  } catch { return { ahead: 0, behind: 0 } }
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
  registerGhostedDB()
  protocol.handle('ghosted-file', (request) => {
    const filePath = decodeURIComponent(request.url.replace('ghosted-file://', ''))
    return net.fetch(`file://${filePath}`)
  })
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
