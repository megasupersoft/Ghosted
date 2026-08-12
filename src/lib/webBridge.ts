// Shims `window.electron` for running the Ghosted renderer in a plain
// browser instead of Electron. Connects to the ghosted2 bridge server over
// WebSocket and replays the same request/response/push envelope Electron's
// IPC would produce, so every consumer of `window.electron.*` behaves
// identically on web and desktop.
//
// Wire contract mirrors ghosted2/shared/bridge.ts — kept out of the renderer
// bundle by design (this file must not import from ghosted2), so the
// envelope types below are a deliberate copy, not a re-export.

import type { PmSnapshot } from '../../electron/pmShared'

const DEFAULT_BRIDGE_URL = 'ws://localhost:4821/bridge'
const READY_TIMEOUT_MS = 10_000
const QUEUE_TIMEOUT_MS = 5_000
const RECONNECT_MAX_DELAY_MS = 5_000
const UNREACHABLE_MESSAGE = 'bridge server not reachable — run: cd ghosted2 && npm run dev:server'

// ---------- isWeb ----------

const webAtLoad = !('electron' in window)

/** True when running without the real Electron preload bridge. Cached at module load. */
export function isWeb(): boolean {
  return webAtLoad
}

// ---------- wire envelope (mirrors ghosted2/shared/bridge.ts) ----------

interface BridgeInvoke {
  t: 'inv'
  id: number
  ch: string
  args: unknown[]
}

interface BridgeResult {
  t: 'res'
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

interface BridgePush {
  t: 'push'
  ch: string
  args: unknown[]
}

interface BridgeReady {
  t: 'ready'
  root: string
}

type BridgeServerMsg = BridgeResult | BridgePush | BridgeReady

function isBridgeResult(msg: unknown): msg is BridgeResult {
  return !!msg && typeof msg === 'object' && (msg as { t?: unknown }).t === 'res'
}

function isBridgePush(msg: unknown): msg is BridgePush {
  return !!msg && typeof msg === 'object' && (msg as { t?: unknown }).t === 'push'
}

function isBridgeReady(msg: unknown): msg is BridgeReady {
  return !!msg && typeof msg === 'object' && (msg as { t?: unknown }).t === 'ready'
}

function parseServerMsg(raw: string): BridgeServerMsg | null {
  try {
    const msg: unknown = JSON.parse(raw)
    if (isBridgeResult(msg) || isBridgePush(msg) || isBridgeReady(msg)) return msg
    return null
  } catch {
    return null
  }
}

function bridgeUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('bridge') || DEFAULT_BRIDGE_URL
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

// ---------- listener registry (outlives any single socket instance) ----------
//
// preload.ts calls `ipcRenderer.removeAllListeners(ch)` before subscribing on
// most channels (pty, workspace, pm, db, pi) — effectively a singleton
// listener per channel. `fs:changed` is the exception: it supports multiple
// concurrent listeners and targeted removal. Both are modeled as a Set here;
// "singleton" registration just clears the set first.

type Listener = (...args: unknown[]) => void

const listeners = new Map<string, Set<Listener>>()

function channelSet(ch: string): Set<Listener> {
  let set = listeners.get(ch)
  if (!set) {
    set = new Set()
    listeners.set(ch, set)
  }
  return set
}

/** Replaces any existing listener(s) on the channel — mirrors removeAllListeners-then-on. */
function onSingleton(ch: string, cb: Listener): void {
  const set = channelSet(ch)
  set.clear()
  set.add(cb)
}

/** Adds without displacing existing listeners — mirrors fs:changed's multi-subscriber behavior. */
function onMulti(ch: string, cb: Listener): Listener {
  channelSet(ch).add(cb)
  return cb
}

function offChannel(ch: string, cb?: Listener): void {
  if (cb) channelSet(ch).delete(cb)
  else listeners.delete(ch)
}

function dispatch(ch: string, args: unknown[]): void {
  const set = listeners.get(ch)
  if (!set) return
  for (const cb of set) cb(...args)
}

// ---------- socket lifecycle ----------

let ws: WebSocket | null = null
let connected = false
let bridgeBroken = false
let reconnecting = false
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function handleMessage(ev: MessageEvent): void {
  const msg = parseServerMsg(ev.data)
  if (!msg) return
  if (msg.t === 'res') {
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new Error(msg.error || `bridge invoke failed`))
  } else if (msg.t === 'push') {
    dispatch(msg.ch, msg.args)
  }
  // 'ready' after the initial handshake carries no further action.
}

function handleClose(): void {
  connected = false
  ws = null
  for (const p of pending.values()) p.reject(new Error('bridge connection closed'))
  pending.clear()
  void reconnectForever()
}

function attachSocket(socket: WebSocket): void {
  ws = socket
  connected = true
  socket.addEventListener('message', handleMessage)
  socket.addEventListener('close', handleClose)
  socket.addEventListener('error', () => {
    /* surfaced via the subsequent close event */
  })
}

/** Connects and resolves once the {t:'ready'} handshake message arrives (or rejects). */
function connectSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let settled = false
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
      return
    }

    const cleanup = () => {
      socket.removeEventListener('message', onMessage)
      socket.removeEventListener('error', onError)
      socket.removeEventListener('close', onClose)
    }
    const onMessage = (ev: MessageEvent) => {
      const msg = parseServerMsg(ev.data)
      if (!settled && msg?.t === 'ready') {
        settled = true
        cleanup()
        resolve(socket)
      }
    }
    const onError = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('bridge websocket error'))
    }
    const onClose = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('bridge websocket closed before ready'))
    }
    socket.addEventListener('message', onMessage)
    socket.addEventListener('error', onError)
    socket.addEventListener('close', onClose)
  })
}

async function connectWithRetry(url: string, deadlineMs: number): Promise<WebSocket> {
  const start = Date.now()
  let delay = 250
  for (;;) {
    try {
      return await connectSocket(url)
    } catch (err) {
      const elapsed = Date.now() - start
      if (elapsed >= deadlineMs) throw err
      await sleep(Math.min(delay, deadlineMs - elapsed))
      delay = Math.min(delay * 2, RECONNECT_MAX_DELAY_MS)
    }
  }
}

async function reconnectForever(): Promise<void> {
  if (reconnecting || bridgeBroken) return
  reconnecting = true
  const url = bridgeUrl()
  let delay = 250
  try {
    for (;;) {
      try {
        const socket = await connectSocket(url)
        attachSocket(socket)
        return
      } catch {
        await sleep(delay)
        delay = Math.min(delay * 2, RECONNECT_MAX_DELAY_MS)
      }
    }
  } finally {
    reconnecting = false
  }
}

function invoke(ch: string, args: unknown[] = []): Promise<unknown> {
  if (bridgeBroken) return Promise.reject(new Error(UNREACHABLE_MESSAGE))

  return new Promise((resolve, reject) => {
    const send = (): boolean => {
      if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return false
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ t: 'inv', id, ch, args } satisfies BridgeInvoke))
      return true
    }

    if (send()) return

    const start = Date.now()
    const timer = window.setInterval(() => {
      if (send()) {
        window.clearInterval(timer)
        return
      }
      if (Date.now() - start >= QUEUE_TIMEOUT_MS) {
        window.clearInterval(timer)
        reject(new Error(`bridge disconnected — invoke '${ch}' timed out after ${QUEUE_TIMEOUT_MS}ms`))
      }
    }, 100)
  })
}

function inv<T>(ch: string, args: unknown[] = []): Promise<T> {
  return invoke(ch, args) as Promise<T>
}

// ---------- ACP namespace ----------
// Not yet in src/types/electron.d.ts (a parallel worker owns that file) —
// modeled locally and attached via cast, per the parent task's instructions.

interface AcpApi {
  agents: () => Promise<unknown[]>
  sessions: () => Promise<unknown[]>
  create: (agentId: string) => Promise<unknown>
  prompt: (sessionId: string, text: string) => Promise<unknown>
  cancel: (sessionId: string) => Promise<unknown>
  decide: (sessionId: string, requestId: string, optionId: string) => Promise<unknown>
  onUpdate: (cb: (update: unknown) => void) => void
  onStatus: (cb: (status: unknown) => void) => void
  onPermission: (cb: (req: unknown) => void) => void
  onPermissionResolved: (cb: (resolved: unknown) => void) => void
  onSession: (cb: (session: unknown) => void) => void
  offAll: () => void
}

const acp: AcpApi = {
  agents: () => inv('acp:agents'),
  sessions: () => inv('acp:sessions'),
  create: (agentId) => inv('acp:create', [{ agentId }]),
  prompt: (sessionId, text) => inv('acp:prompt', [{ sessionId, text }]),
  cancel: (sessionId) => inv('acp:cancel', [{ sessionId }]),
  decide: (sessionId, requestId, optionId) => inv('acp:decide', [{ sessionId, requestId, optionId }]),
  onUpdate: (cb) => onSingleton('acp:update', cb),
  onStatus: (cb) => onSingleton('acp:status', cb),
  onPermission: (cb) => onSingleton('acp:permission', cb),
  onPermissionResolved: (cb) => onSingleton('acp:permission-resolved', cb),
  onSession: (cb) => onSingleton('acp:session', cb),
  offAll: () => {
    offChannel('acp:update')
    offChannel('acp:status')
    offChannel('acp:permission')
    offChannel('acp:permission-resolved')
    offChannel('acp:session')
  },
}

// ---------- ElectronAPI implementation ----------

type ElectronAPI = Window['electron']

function buildElectronApi(): ElectronAPI & { acp: AcpApi } {
  const api: ElectronAPI = {
    fs: {
      readdir: (p) => inv('fs:readdir', [p]),
      readfile: (p) => inv('fs:readfile', [p]),
      writefile: (p, c) => inv('fs:writefile', [p, c]),
      homedir: () => inv('fs:homedir'),
      mkdir: (p) => inv('fs:mkdir', [p]),
      newfile: (p, c) => inv('fs:newfile', [p, c]),
      rename: (oldPath, newPath) => inv('fs:rename', [oldPath, newPath]),
      delete: (p) => inv('fs:delete', [p]),
      copy: (src, dest) => inv('fs:copy', [src, dest]),
      exists: (p) => inv('fs:exists', [p]),
      stat: (p) => inv('fs:stat', [p]),
      watch: (p) => inv('fs:watch', [p]),
      unwatch: (p) => inv('fs:unwatch', [p]),
      onChanged: (cb) => onMulti('fs:changed', cb as Listener),
      offChanged: (handler) => offChannel('fs:changed', handler as Listener | undefined),
    },
    pty: {
      create: (id, cwd, cols, rows) => inv('pty:create', [id, cwd, cols, rows]),
      write: (id, data) => inv('pty:write', [id, data]),
      resize: (id, cols, rows) => inv('pty:resize', [id, cols, rows]),
      kill: (id) => inv('pty:kill', [id]),
      onData: (id, cb) => onSingleton(`pty:data:${id}`, cb as Listener),
      onExit: (id, cb) => onSingleton(`pty:exit:${id}`, cb as Listener),
      removeListeners: (id) => {
        offChannel(`pty:data:${id}`)
        offChannel(`pty:exit:${id}`)
      },
    },
    shell: {
      // No server round-trip for these — they're satisfied entirely client-side.
      openExternal: (url) => {
        window.open(url, '_blank')
        return Promise.resolve()
      },
      showItemInFolder: () => Promise.resolve(),
    },
    dialog: {
      openFolder: async () => {
        const p = window.prompt('Absolute path to workspace folder:')
        if (!p) return null
        return inv<string | null>('web:grantPath', [p])
      },
      saveFile: async (defaultName, filterExts) => {
        const hint = filterExts?.length ? ` (${filterExts.join(', ')})` : ''
        const p = window.prompt(`Absolute path to save file as${hint}:`, defaultName ?? '')
        if (!p) return null
        return inv<string | null>('web:grantPath', [p])
      },
      openFile: async (filterExts) => {
        const hint = filterExts?.length ? ` (${filterExts.join(', ')})` : ''
        const p = window.prompt(`Absolute path to file to open${hint}:`)
        if (!p) return null
        return inv<string | null>('web:grantPath', [p])
      },
    },
    workspace: {
      restore: (p) => inv('workspace:restore', [p]),
      initial: () => inv('workspace:initial'),
      onOpen: (cb) => onSingleton('workspace:open', cb as Listener),
      offOpen: () => offChannel('workspace:open'),
    },
    cli: {
      install: () => Promise.reject(new Error('not available on web')),
    },
    pm: {
      connect: (cwd) => inv<PmSnapshot>('pm:connect', [cwd]),
      select: (projectNumber) => inv('pm:select', [projectNumber]),
      refresh: () => inv('pm:refresh'),
      state: () => inv<PmSnapshot>('pm:state'),
      visibility: (visible) => inv('pm:visibility', [visible]),
      op: (op) => inv('pm:op', [op]),
      onUpdate: (cb) => onSingleton('pm:update', cb as Listener),
      offUpdate: () => offChannel('pm:update'),
    },
    fileDrop: {
      // No webUtils outside Electron's preload — dropped files can't be
      // resolved to a disk path from the browser sandbox.
      getPath: async () => null,
    },
    db: {
      index: (workspacePath) => inv('db:index', [workspacePath]),
      query: (q) => inv('db:query', [q]),
      get: (filePath) => inv('db:get', [filePath]),
      stats: () => inv('db:stats'),
      onChange: (cb) => onSingleton('db:changed', cb as Listener),
      offChange: () => offChannel('db:changed'),
    },
    pi: {
      create: (sessionId, cwd) => inv('pi:create', [sessionId, cwd]),
      prompt: (sessionId, message) => inv('pi:prompt', [sessionId, message]),
      abort: (sessionId) => inv('pi:abort', [sessionId]),
      dispose: (sessionId) => inv('pi:dispose', [sessionId]),
      onEvent: (sessionId, cb) => onSingleton(`pi:event:${sessionId}`, cb as Listener),
      removeListeners: (sessionId) => offChannel(`pi:event:${sessionId}`),
      onAction: (cb) => onSingleton('pi:action', cb as Listener),
      offAction: () => offChannel('pi:action'),
    },
    git: {
      log: (cwd, count) => inv('git:log', [cwd, count]),
      diffSummary: (cwd) => inv('git:diffSummary', [cwd]),
      status: (cwd) => inv('git:status', [cwd]),
      branch: (cwd) => inv('git:branch', [cwd]),
      stage: (cwd, path) => inv('git:stage', [cwd, path]),
      unstage: (cwd, path) => inv('git:unstage', [cwd, path]),
      stageAll: (cwd) => inv('git:stageAll', [cwd]),
      commit: (cwd, message) => inv('git:commit', [cwd, message]),
      aheadBehind: (cwd) => inv('git:aheadBehind', [cwd]),
      push: (cwd) => inv('git:push', [cwd]),
      pull: (cwd) => inv('git:pull', [cwd]),
      discard: (cwd, path) => inv('git:discard', [cwd, path]),
      remote: (cwd) => inv('git:remote', [cwd]),
      gh: (cwd, args) => inv('gh:run', [cwd, args]),
    },
  }

  return Object.assign(api, { acp })
}

/**
 * Connects to the ghosted2 bridge server and installs a full ElectronAPI
 * implementation on `window.electron`. Retries the initial handshake with
 * backoff for up to ~10s; if that fails entirely, the shim still installs,
 * but every invoke rejects with a clear "run the bridge server" error so the
 * app degrades instead of throwing on `window.electron` being undefined.
 */
export async function installWebBridge(): Promise<void> {
  try {
    const socket = await connectWithRetry(bridgeUrl(), READY_TIMEOUT_MS)
    attachSocket(socket)
  } catch (err) {
    bridgeBroken = true
    console.warn(`[webBridge] ${UNREACHABLE_MESSAGE}`, err)
  }
  ;(window as unknown as { electron: ElectronAPI }).electron = buildElectronApi()
}
