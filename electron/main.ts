import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, nativeImage, net, protocol, shell } from 'electron'
import { devCliArgs, extractWorkspaceArg } from './cliArgs'
import { registerGhostedDB } from './ghostdb'
import { startRpcServer } from './rpc'

const isDev = !app.isPackaged
const VITE_DEV_SERVER = 'http://localhost:5173'

// Suppress noisy GTK CSS parser warnings (GTK4 theme properties parsed by GTK3)
if (process.platform === 'linux') {
  process.env.G_ENABLE_DIAGNOSTIC = '0'
}

// Set the app name so macOS menu bar and dock say "Ghosted" instead of "Electron"
app.setName('Ghosted')

// Test isolation: e2e runs point userData at a temp dir so window state and
// workspace grants never touch (or depend on) the real profile.
if (process.env.GHOSTED_USER_DATA) {
  app.setPath('userData', process.env.GHOSTED_USER_DATA)
}

// ── CLI launcher (`ghosted .`) ───────────────────────────────────────────────
const isExistingDir = (p: string) => {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

const userArgs = (argv: string[]) => (app.isPackaged ? argv.slice(1) : devCliArgs(argv))

const cliWorkspace = extractWorkspaceArg(userArgs(process.argv), process.cwd(), isExistingDir)

// One app instance per profile — the lock is scoped to userData, so isolated
// e2e profiles never collide with a running dev instance. A second `ghosted .`
// hands its directory to the running instance and exits.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv, workingDirectory) => {
    const dir = extractWorkspaceArg(userArgs(argv), workingDirectory, isExistingDir)
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    if (dir) {
      grantRoot(dir)
      win?.webContents.send('workspace:open', dir)
    }
  })
}

// ── Window state persistence ─────────────────────────────────────────────────
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json')

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
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
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state))
  } catch {}
}

function getAppIcon(): Electron.NativeImage | undefined {
  const candidates = isDev
    ? [path.join(__dirname, '../build/icon-1024.png'), path.join(__dirname, '../build/icon.png')]
    : [path.join(__dirname, '../build/icon-1024.png'), path.join(__dirname, '../dist/icon-1024.png')]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) return img
      }
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

  // Prevent Electron's default context menu so our custom React menus work
  win.webContents.on('context-menu', (e) => e.preventDefault())

  const loadBuilt = () => win.loadFile(path.join(__dirname, '../dist/index.html'))

  if (isDev) {
    // Check if Vite dev server is running before trying to connect
    import('node:http').then((http) => {
      const req = http.get(VITE_DEV_SERVER, () => {
        req.destroy()
        win.loadURL(VITE_DEV_SERVER)
      })
      req.on('error', () => loadBuilt())
      req.setTimeout(1000, () => {
        req.destroy()
        loadBuilt()
      })
    })
  } else {
    loadBuilt()
  }
}

// ── Workspace access control ─────────────────────────────────────────────────
// The renderer only gets filesystem access inside workspace roots the user has
// granted through the native folder picker. Grants persist in userData so a
// restored workspace keeps working across launches without re-prompting.
const ROOTS_FILE = path.join(app.getPath('userData'), 'granted-roots.json')

function loadGrantedRoots(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(ROOTS_FILE, 'utf-8'))
    if (Array.isArray(parsed)) return parsed.filter((r): r is string => typeof r === 'string')
  } catch {}
  return []
}
const grantedRoots: string[] = loadGrantedRoots()

function grantRoot(dir: string) {
  const resolved = path.resolve(dir)
  if (!grantedRoots.includes(resolved)) {
    grantedRoots.push(resolved)
    try {
      fs.writeFileSync(ROOTS_FILE, JSON.stringify(grantedRoots))
    } catch {}
  }
}

// Session-only grants for individual files/folders dropped from the OS.
// Populated via fs:grantDropped, which is only reachable through the preload's
// webUtils bridge (a genuine File object is required to obtain a path).
const droppedGrants = new Set<string>()

function isAllowedPath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0) return false
  const resolved = path.resolve(p)
  if (grantedRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep))) return true
  for (const g of droppedGrants) {
    if (resolved === g || resolved.startsWith(g + path.sep)) return true
  }
  return false
}

ipcMain.handle('fs:grantDropped', (_e, p: string) => {
  if (typeof p !== 'string' || !p || !path.isAbsolute(p)) return false
  droppedGrants.add(path.resolve(p))
  return true
})

function assertAllowed(p: string): string {
  if (!isAllowedPath(p)) throw new Error(`Access denied: path is outside granted workspace roots`)
  return path.resolve(p)
}

// Restore access to a previously granted workspace on startup. Called by the
// renderer before it touches the filesystem. Only paths granted in an earlier
// session are accepted — with a one-time migration exception for installs that
// predate granted-roots.json (bounded: must be an existing directory, and not
// the home directory or a filesystem root).
ipcMain.handle('workspace:restore', (_e, dir: string) => {
  if (typeof dir !== 'string' || !dir) return false
  const resolved = path.resolve(dir)
  if (grantedRoots.includes(resolved)) return true
  if (!fs.existsSync(ROOTS_FILE)) {
    try {
      const stat = fs.statSync(resolved)
      const isRoot = resolved === path.parse(resolved).root
      if (stat.isDirectory() && !isRoot && resolved !== os.homedir()) {
        grantRoot(resolved)
        return true
      }
    } catch {}
  }
  return false
})

// The workspace handed over by the CLI launcher, if any. Granted on first ask
// (after module init) — a CLI-provided path is user intent, same trust as the
// native folder picker.
ipcMain.handle('workspace:initial', () => {
  if (!cliWorkspace) return null
  grantRoot(cliWorkspace)
  return cliWorkspace
})

// Symlink the bundled `ghosted` launcher script into /usr/local/bin.
ipcMain.handle('cli:install', () => {
  if (process.platform === 'win32') {
    return { ok: false, error: 'CLI install is not supported on Windows yet' }
  }
  const source = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ghosted')
    : path.join(__dirname, '..', 'bin', 'ghosted')
  const target = '/usr/local/bin/ghosted'
  try {
    if (!fs.existsSync(source)) return { ok: false, error: `launcher script missing: ${source}` }
    fs.chmodSync(source, 0o755)
    try {
      if (fs.lstatSync(target).isSymbolicLink() || fs.existsSync(target)) fs.unlinkSync(target)
    } catch {}
    fs.symlinkSync(source, target)
    return { ok: true, path: target }
  } catch (err: any) {
    return {
      ok: false,
      error: `${err.message} — run manually: sudo ln -sf "${source}" "${target}"`,
    }
  }
})

// ── File system IPC ──
ipcMain.handle('fs:readdir', async (_e, dirPath: string) => {
  const dir = assertAllowed(dirPath)
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.map((e) => ({
    name: e.name,
    path: path.join(dir, e.name),
    isDirectory: e.isDirectory(),
  }))
})
ipcMain.handle('fs:readfile', async (_e, filePath: string) =>
  fs.readFileSync(assertAllowed(filePath), 'utf-8'),
)
ipcMain.handle('fs:writefile', async (_e, filePath: string, content: string) => {
  fs.writeFileSync(assertAllowed(filePath), content, 'utf-8')
  return true
})
ipcMain.handle('fs:homedir', () => os.homedir())
ipcMain.handle('fs:mkdir', async (_e, dirPath: string) => {
  fs.mkdirSync(assertAllowed(dirPath), { recursive: true })
  return true
})
ipcMain.handle('fs:newfile', async (_e, filePath: string, content?: string) => {
  fs.writeFileSync(assertAllowed(filePath), content ?? '', 'utf-8')
  return true
})
ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => {
  fs.renameSync(assertAllowed(oldPath), assertAllowed(newPath))
  return true
})
ipcMain.handle('fs:delete', async (_e, targetPath: string) => {
  const target = assertAllowed(targetPath)
  const stat = fs.statSync(target)
  if (stat.isDirectory()) {
    fs.rmSync(target, { recursive: true, force: true })
  } else {
    fs.unlinkSync(target)
  }
  return true
})
ipcMain.handle('fs:copy', async (_e, srcPath: string, destPath: string) => {
  fs.cpSync(assertAllowed(srcPath), assertAllowed(destPath), { recursive: true })
  return true
})
ipcMain.handle(
  'fs:exists',
  async (_e, targetPath: string) => isAllowedPath(targetPath) && fs.existsSync(path.resolve(targetPath)),
)
ipcMain.handle('fs:stat', async (_e, targetPath: string) => {
  try {
    const stat = fs.statSync(assertAllowed(targetPath))
    return { isDirectory: stat.isDirectory(), isFile: stat.isFile(), size: stat.size, mtime: stat.mtimeMs }
  } catch {
    return null
  }
})

// ── File watcher IPC ──
const watchers = new Map<string, fs.FSWatcher>()

ipcMain.handle('fs:watch', async (_e, dirPath: string) => {
  if (!isAllowedPath(dirPath)) return false
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
  } catch {
    return false
  }
})

ipcMain.handle('fs:unwatch', async (_e, dirPath: string) => {
  const w = watchers.get(dirPath)
  if (w) {
    w.close()
    watchers.delete(dirPath)
  }
  return true
})

// Only web/mail URLs may leave the app — file://, smb://, and app-scheme URLs
// printed to the terminal or embedded in markdown must not trigger OS opens.
const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
ipcMain.handle('shell:openExternal', (_e, url: string) => {
  try {
    if (!SAFE_EXTERNAL_PROTOCOLS.has(new URL(url).protocol)) return
  } catch {
    return
  }
  return shell.openExternal(url)
})
ipcMain.handle('shell:showItemInFolder', (_e, fullPath: string) =>
  shell.showItemInFolder(assertAllowed(fullPath)),
)
// Native file pickers. A user-chosen path is user intent — grant it so the
// renderer can read/write exactly that file and nothing else.
ipcMain.handle('dialog:saveFile', async (_e, defaultName?: string, filterExts?: string[]) => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null
  const result = await dialog.showSaveDialog(win, {
    title: 'Export',
    defaultPath: defaultName,
    ...(filterExts?.length ? { filters: [{ name: 'Export', extensions: filterExts }] } : {}),
  })
  if (result.canceled || !result.filePath) return null
  droppedGrants.add(path.resolve(result.filePath))
  return result.filePath
})

ipcMain.handle('dialog:openFile', async (_e, filterExts?: string[]) => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    title: 'Import',
    properties: ['openFile'],
    ...(filterExts?.length ? { filters: [{ name: 'Import', extensions: filterExts }] } : {}),
  })
  if (result.canceled || !result.filePaths[0]) return null
  droppedGrants.add(path.resolve(result.filePaths[0]))
  return result.filePaths[0]
})

ipcMain.handle('dialog:openFolder', async () => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Open Workspace',
  })
  if (result.canceled || !result.filePaths[0]) return null
  grantRoot(result.filePaths[0])
  return result.filePaths[0]
})

// ── Terminal IPC (node-pty) ──
let pty: typeof import('node-pty') | null = null
// Load node-pty with correct paths for both dev and packaged builds.
// Key insight: node-pty needs TWO binaries:
//   1. pty.node — native addon loaded via require() / dlopen
//   2. spawn-helper — standalone executable called via posix_spawn on macOS/Linux
// The spawn-helper MUST have execute permission (chmod 755) and MUST be outside
// the asar archive. See: https://github.com/microsoft/node-pty/issues/789
//                         https://github.com/microsoft/node-pty/issues/850
function loadPty() {
  const appRoot = path.join(__dirname, '..')
  const unpackedRoot = app.isPackaged
    ? appRoot.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked')
    : appRoot
  const ptyRoot = path.join(unpackedRoot, 'node_modules', 'node-pty')

  // Try multiple native binary locations
  const candidates = [
    path.join(ptyRoot, 'build', 'Release', 'pty.node'),
    path.join(ptyRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'pty.node'),
  ]

  const nativePath = candidates.find((p) => fs.existsSync(p))
  const utilsPath = path.join(ptyRoot, 'lib', 'utils.js')

  if (nativePath && fs.existsSync(utilsPath)) {
    const nativeDir = path.dirname(nativePath)

    // Verify spawn-helper exists and is executable (macOS / Linux only)
    if (process.platform !== 'win32') {
      const spawnHelper = path.join(nativeDir, 'spawn-helper')
      if (!fs.existsSync(spawnHelper)) {
        console.error('node-pty FATAL: spawn-helper not found at', spawnHelper)
        console.error('pty.spawn() WILL fail with "posix_spawnp failed"')
      } else {
        // Fix missing execute bit (node-pty#850: npm tarball ships 644)
        try {
          fs.chmodSync(spawnHelper, 0o755)
        } catch {}
      }
    }

    // Patch unixTerminal.js source to hardcode the spawn-helper path.
    // Electron's asar module corrupts path.resolve on app.asar.unpacked paths,
    // doubling .unpacked suffix. We fix this by rewriting the JS before require.
    try {
      const utils = require(utilsPath)
      utils.loadNativeModule = () => ({
        dir: `${nativeDir}/`,
        module: require(nativePath),
      })

      // Patch unixTerminal.js to fix the helperPath.
      // node-pty has buggy .replace('app.asar', 'app.asar.unpacked') that corrupts
      // paths already containing app.asar.unpacked → app.asar.unpacked.unpacked
      const utPath = path.join(ptyRoot, 'lib', 'unixTerminal.js')
      const utSrc = fs.readFileSync(utPath, 'utf8')
      const correctHelperPath = path.join(nativeDir, 'spawn-helper')
      // Replace the entire helperPath computation block with a hardcoded path
      let patched = utSrc
      // Remove the original helperPath assignment and all .replace() fixups
      patched = patched.replace(
        /var helperPath = .*?;\s*(?:helperPath = .*?;\s*)*/,
        `var helperPath = ${JSON.stringify(correctHelperPath)};\n`,
      )
      if (patched !== utSrc) {
        fs.writeFileSync(utPath, patched, 'utf8')
        console.log('Patched unixTerminal.js helperPath →', correctHelperPath)
      }

      pty = require(ptyRoot)
      console.log('node-pty loaded OK from', nativeDir)
      return
    } catch (e: any) {
      console.error('node-pty patched load failed:', e.message)
    }
  }

  // Fallback: plain require (works when binary is in standard location)
  try {
    pty = require('node-pty')
    console.log('node-pty loaded OK (fallback)')
  } catch (e: any) {
    console.error('node-pty load failed:', e.message)
  }
}
loadPty()

const terminals = new Map<string, import('node-pty').IPty>()

ipcMain.handle('pty:create', (_e, id: string, cwd: string, cols?: number, rows?: number) => {
  if (!pty) return { ok: false, error: 'node-pty not loaded' }
  // Kill existing if any (handles hot reloads)
  if (terminals.has(id)) {
    terminals.get(id)?.kill()
    terminals.delete(id)
  }
  const sh = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash'
  try {
    const t = pty.spawn(sh, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd || os.homedir(),
      env: { ...process.env, GHOSTED_SOCKET: rpcSocketPath } as Record<string, string>,
    })
    terminals.set(id, t)
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return { ok: false, error: 'no BrowserWindow' }
    t.onData((data) => {
      if (!win.isDestroyed()) win.webContents.send(`pty:data:${id}`, data)
    })
    t.onExit(() => {
      if (!win.isDestroyed()) win.webContents.send(`pty:exit:${id}`)
    })
    return { ok: true }
  } catch (e: any) {
    console.error('pty:create FAILED:', e.message, e.stack)
    return { ok: false, error: `spawn failed: ${e.message}` }
  }
})
ipcMain.handle('pty:write', (_e, id: string, data: string) => terminals.get(id)?.write(data))
ipcMain.handle('pty:resize', (_e, id: string, cols: number, rows: number) =>
  terminals.get(id)?.resize(cols, rows),
)
ipcMain.handle('pty:kill', (_e, id: string) => {
  terminals.get(id)?.kill()
  terminals.delete(id)
})

// ── Git IPC ──
// cwd is confined to granted workspace roots so the renderer can only run
// git/gh against repos the user has actually opened.
function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd: assertAllowed(cwd), encoding: 'utf-8', timeout: 30000 }).trim()
}

ipcMain.handle('gh:run', async (_e, cwd: string, args: string) => {
  try {
    // Use execFileSync with shell:false to avoid $ being interpreted by the shell
    // Split args respecting quoted strings
    const parsed = parseArgs(args)
    const result = execFileSync('gh', parsed, {
      cwd: assertAllowed(cwd),
      encoding: 'utf-8',
      timeout: 15000,
    }).trim()
    return { ok: true, data: result }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

function parseArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (current) {
        args.push(current)
        current = ''
      }
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
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, author, email, date, subject, refs, parents] = line.split(SEP)
        return {
          hash,
          shortHash,
          author,
          email,
          date,
          subject,
          refs,
          parents: parents?.split(' ').filter(Boolean) ?? [],
        }
      })
  } catch {
    return []
  }
})

ipcMain.handle('git:status', async (_e, cwd: string) => {
  try {
    const raw = git(cwd, ['status', '--porcelain=v1', '-uall'])
    if (!raw) return []
    return raw.split('\n').map((line) => {
      const x = line[0]
      const y = line[1]
      const filePath = line.slice(3)
      return { x, y, path: filePath }
    })
  } catch {
    return []
  }
})

ipcMain.handle('git:branch', async (_e, cwd: string) => {
  try {
    return git(cwd, ['branch', '--show-current'])
  } catch {
    return ''
  }
})

ipcMain.handle('git:diffSummary', async (_e, cwd: string) => {
  try {
    let diff = ''
    try {
      diff = git(cwd, ['diff', '--cached', '--stat'])
    } catch {}
    if (!diff)
      try {
        diff = git(cwd, ['diff', '--stat'])
      } catch {}
    let untracked = ''
    try {
      untracked = git(cwd, ['ls-files', '--others', '--exclude-standard'])
    } catch {}
    return { diff, untracked }
  } catch {
    return { diff: '', untracked: '' }
  }
})

function repoRemote(cwd: string): { owner: string; name: string } | null {
  try {
    const url = git(cwd, ['remote', 'get-url', 'origin'])
    const ssh = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    return ssh ? { owner: ssh[1], name: ssh[2] } : null
  } catch {
    return null
  }
}

ipcMain.handle('git:remote', async (_e, cwd: string) => {
  const remote = repoRemote(cwd)
  return remote ? { owner: remote.owner, repo: remote.name } : null
})

// ── GitHub Projects sync (PM panes) ─────────────────────────────────────────
let pmService: import('./projectSync').ProjectSyncService | null = null

function getPmService(): import('./projectSync').ProjectSyncService {
  if (!pmService) {
    // Lazy import keeps startup lean — the service only loads when a PM pane connects
    const { ProjectSyncService } = require('./projectSync') as typeof import('./projectSync')
    pmService = new ProjectSyncService({
      userDataDir: app.getPath('userData'),
      getRepoRemote: repoRemote,
      onUpdate: (snapshot) => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed()) win.webContents.send('pm:update', snapshot)
      },
    })
  }
  return pmService
}

const PM_OP_KINDS = new Set(['setStatus', 'setPriority', 'setDate', 'reorder', 'create'])

ipcMain.handle('pm:connect', async (_e, cwd: string) => getPmService().connect(assertAllowed(cwd)))
ipcMain.handle('pm:select', async (_e, projectNumber: number) => {
  if (typeof projectNumber !== 'number') return
  await getPmService().selectProject(projectNumber)
})
ipcMain.handle('pm:refresh', async () => getPmService().refresh())
ipcMain.handle('pm:state', () => getPmService().snapshot())
ipcMain.handle('pm:visibility', (_e, visible: boolean) => getPmService().setVisible(Boolean(visible)))
ipcMain.handle('pm:op', (_e, op: unknown) => {
  const o = op as { kind?: string; opId?: string; itemId?: string; attempts?: number }
  if (!o || typeof o !== 'object' || !PM_OP_KINDS.has(String(o.kind))) return false
  if (typeof o.opId !== 'string' || typeof o.itemId !== 'string') return false
  o.attempts = 0
  getPmService().enqueue(o as import('./pmShared').PmOp)
  return true
})

app.on('before-quit', () => pmService?.destroy())

ipcMain.handle('git:aheadBehind', async (_e, cwd: string) => {
  try {
    const raw = git(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])
    const [ahead, behind] = raw.split(/\s+/).map(Number)
    return { ahead: ahead || 0, behind: behind || 0 }
  } catch {
    return { ahead: 0, behind: 0 }
  }
})

ipcMain.handle('git:stage', async (_e, cwd: string, filePath: string) => {
  try {
    git(cwd, ['add', '--', filePath])
    return true
  } catch {
    return false
  }
})

ipcMain.handle('git:unstage', async (_e, cwd: string, filePath: string) => {
  try {
    git(cwd, ['reset', 'HEAD', '--', filePath])
    return true
  } catch {
    return false
  }
})

ipcMain.handle('git:stageAll', async (_e, cwd: string) => {
  try {
    git(cwd, ['add', '-A'])
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.stderr || err.message }
  }
})

ipcMain.handle('git:commit', async (_e, cwd: string, message: string) => {
  try {
    git(cwd, ['commit', '-m', message])
    return { ok: true }
  } catch (err: any) {
    const stderr = typeof err.stderr === 'string' ? err.stderr.trim() : ''
    const stdout = typeof err.stdout === 'string' ? err.stdout.trim() : ''
    return { ok: false, error: stderr || stdout || err.message }
  }
})

ipcMain.handle('git:push', async (_e, cwd: string) => {
  try {
    git(cwd, ['push'])
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: (err.stderr || err.stdout || err.message || '').toString().trim() }
  }
})

ipcMain.handle('git:pull', async (_e, cwd: string) => {
  try {
    git(cwd, ['pull'])
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: (err.stderr || err.stdout || err.message || '').toString().trim() }
  }
})

ipcMain.handle('git:discard', async (_e, cwd: string, filePath: string) => {
  try {
    git(cwd, ['checkout', '--', filePath])
    return true
  } catch {
    return false
  }
})

// ── Pi SDK IPC ──
// Sessions live in main process (needs Node.js APIs for AuthStorage, filesystem, etc.)
const piSessions = new Map<string, any>()

// Build Ghosted-specific tools so Pi can interact with the editor UI
function buildGhostedTools() {
  const { Type } = require('@sinclair/typebox')

  return [
    {
      name: 'ghosted_open_file',
      label: 'Open File in Editor',
      description:
        'Open a file in the Ghosted editor pane. Use this when the user asks to open, show, or view a file.',
      promptSnippet: 'ghosted_open_file: Open a file in the Ghosted editor UI',
      parameters: Type.Object({
        path: Type.String({ description: 'Absolute path to the file to open' }),
      }),
      async execute(_toolCallId: string, params: { path: string }) {
        const win = BrowserWindow.getAllWindows()[0]
        if (!win || win.isDestroyed()) {
          return { content: [{ type: 'text', text: 'No Ghosted window available' }], details: {} }
        }
        const filePath = params.path
        const name = filePath.split('/').pop() ?? filePath
        let content = ''
        try {
          content = fs.readFileSync(filePath, 'utf-8')
        } catch {}
        win.webContents.send('pi:action', { type: 'openFile', filePath, name, content })
        return { content: [{ type: 'text', text: `Opened ${name} in the editor.` }], details: {} }
      },
    },
    {
      name: 'ghosted_open_terminal',
      label: 'Open Terminal',
      description: 'Open or focus the terminal pane in Ghosted.',
      promptSnippet: 'ghosted_open_terminal: Switch to terminal pane in Ghosted',
      parameters: Type.Object({}),
      async execute() {
        const win = BrowserWindow.getAllWindows()[0]
        if (!win || win.isDestroyed()) {
          return { content: [{ type: 'text', text: 'No Ghosted window available' }], details: {} }
        }
        win.webContents.send('pi:action', { type: 'switchPane', pane: 'terminal' })
        return { content: [{ type: 'text', text: 'Switched to terminal pane.' }], details: {} }
      },
    },
    {
      name: 'ghosted_switch_pane',
      label: 'Switch Pane',
      description: 'Switch to a specific pane in Ghosted: editor, terminal, graph, canvas, kanban, or ai.',
      promptSnippet: 'ghosted_switch_pane: Switch to a named pane in Ghosted',
      parameters: Type.Object({
        pane: Type.Union(
          [
            Type.Literal('editor'),
            Type.Literal('terminal'),
            Type.Literal('graph'),
            Type.Literal('canvas'),
            Type.Literal('kanban'),
            Type.Literal('ai'),
          ],
          { description: 'Pane to switch to' },
        ),
      }),
      async execute(_toolCallId: string, params: { pane: string }) {
        const win = BrowserWindow.getAllWindows()[0]
        if (!win || win.isDestroyed()) {
          return { content: [{ type: 'text', text: 'No Ghosted window available' }], details: {} }
        }
        win.webContents.send('pi:action', { type: 'switchPane', pane: params.pane })
        return { content: [{ type: 'text', text: `Switched to ${params.pane} pane.` }], details: {} }
      },
    },
  ]
}

ipcMain.handle('pi:create', async (_e, sessionId: string, cwd?: string) => {
  try {
    // Kill existing session if any
    const existing = piSessions.get(sessionId)
    if (existing) {
      try {
        existing.dispose()
      } catch {}
      piSessions.delete(sessionId)
    }

    const { createAgentSession, AuthStorage, ModelRegistry, SessionManager } = await import(
      '@mariozechner/pi-coding-agent'
    )

    const authStorage = AuthStorage.create()
    const modelRegistry = new ModelRegistry(authStorage)

    let customTools: any[] = []
    try {
      customTools = buildGhostedTools()
    } catch (e: any) {
      console.warn('Failed to build Ghosted tools:', e.message)
    }

    const { session } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      authStorage,
      modelRegistry,
      cwd: cwd || process.cwd(),
      customTools,
    })

    const win = BrowserWindow.getAllWindows()[0]

    session.subscribe((event: any) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(`pi:event:${sessionId}`, event)
      }
    })

    piSessions.set(sessionId, session)
    return { ok: true }
  } catch (err: any) {
    console.error('pi:create failed:', err)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('pi:prompt', async (_e, sessionId: string, message: string) => {
  const session = piSessions.get(sessionId)
  if (!session) return { ok: false, error: 'No active Pi session' }
  try {
    await session.prompt(message)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('pi:abort', async (_e, sessionId: string) => {
  const session = piSessions.get(sessionId)
  if (!session) return
  try {
    await session.abort()
  } catch {}
})

ipcMain.handle('pi:dispose', async (_e, sessionId: string) => {
  const session = piSessions.get(sessionId)
  if (!session) return
  try {
    session.dispose()
  } catch {}
  piSessions.delete(sessionId)
})

// ── Terminal RPC (pi.dev / scripts / `ghosted open`) ─────────────────────────
// A local socket that lets processes inside Ghosted's terminal drive the app.
// The path is exported to every PTY as GHOSTED_SOCKET.
const rpcSocketPath =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\ghosted-${Buffer.from(app.getPath('userData')).toString('hex').slice(0, 24)}`
    : path.join(app.getPath('userData'), 'rpc.sock')
let rpcServer: import('node:net').Server | null = null

const PANE_IDS = new Set(['editor', 'terminal', 'graph', 'canvas', 'kanban', 'timeline', 'ai', 'settings'])
const RPC_MAX_FILE = 1024 * 1024

function sendToRenderer(action: Record<string, unknown>) {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) win.webContents.send('pi:action', action)
}

function startGhostedRpc() {
  if (process.platform !== 'win32') {
    try {
      fs.rmSync(rpcSocketPath, { force: true })
    } catch {}
  }
  rpcServer = startRpcServer(rpcSocketPath, {
    ping: () => 'pong',
    workspaces: () => [...grantedRoots],
    openFile: ({ path: p }) => {
      if (typeof p !== 'string' || !p || !path.isAbsolute(p))
        throw new Error('openFile needs an absolute path')
      const resolved = path.resolve(p)
      const stat = fs.statSync(resolved)
      if (!stat.isFile()) throw new Error(`not a file: ${resolved}`)
      if (stat.size > RPC_MAX_FILE) throw new Error('file too large for editor open')
      // Local socket = same-user intent, equivalent trust to a file drop
      droppedGrants.add(resolved)
      const content = fs.readFileSync(resolved, 'utf-8')
      sendToRenderer({
        type: 'openFile',
        filePath: resolved,
        name: resolved.split(path.sep).pop() ?? resolved,
        content,
      })
      return true
    },
    switchPane: ({ pane }) => {
      if (typeof pane !== 'string' || !PANE_IDS.has(pane)) {
        throw new Error(`pane must be one of: ${[...PANE_IDS].join(', ')}`)
      }
      sendToRenderer({ type: 'switchPane', pane })
      return true
    },
    notify: ({ level, text }) => {
      if (typeof text !== 'string' || !text) throw new Error('notify needs text')
      const lvl = level === 'warn' || level === 'error' ? level : 'info'
      sendToRenderer({ type: 'notify', level: lvl, text: text.slice(0, 500) })
      return true
    },
  })
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(rpcSocketPath, 0o600)
    } catch {}
  }
}

app.on('will-quit', () => {
  rpcServer?.close()
  if (process.platform !== 'win32') {
    try {
      fs.rmSync(rpcSocketPath, { force: true })
    } catch {}
  }
})

// Register protocol to serve local files (images, videos) to the renderer.
// Reads are confined to granted workspace roots; the scheme is listed in the
// CSP (img-src/media-src) instead of bypassing it.
protocol.registerSchemesAsPrivileged([
  { scheme: 'ghosted-file', privileges: { stream: true, supportFetchAPI: true } },
])

app.whenReady().then(() => {
  registerGhostedDB(isAllowedPath)
  startGhostedRpc()
  protocol.handle('ghosted-file', (request) => {
    const filePath = decodeURIComponent(request.url.replace('ghosted-file://', ''))
    if (!isAllowedPath(filePath)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(path.resolve(filePath)).toString())
  })
  createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
