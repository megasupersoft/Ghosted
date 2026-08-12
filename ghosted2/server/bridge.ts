// Ghosted web bridge — serves the EXISTING Electron renderer's `window.electron.*`
// surface over a WebSocket at ws://localhost:4821/bridge.
//
// Every channel below mirrors the request/response shape of the matching
// `ipcMain.handle` in ../../electron/main.ts, because the renderer is unchanged
// and destructures those exact shapes. Where Electron-only capabilities do not
// exist on the web (native pickers, OS shell), the handler degrades to the
// "user cancelled" value rather than throwing.
//
// Path confinement mirrors main.ts's `assertAllowed`: every filesystem/git call
// is proven to live inside a granted root first. The grant set is seeded with
// GHOSTED2_ROOT and extended by `web:grantPath` (the web replacement for the
// native folder picker) and `workspace:restore`.

import { execFileSync, spawn as spawnChild } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';

import type { BridgeInvoke, BridgeServerMsg } from '../shared/bridge';
import type { ServerMsg } from '../shared/protocol';
import type { AcpHost } from './acpHost';
import { listAgents } from './agents';

import type { PmOp, PmSnapshot } from '../../electron/pmShared';
import type { ProjectSyncService } from '../../electron/projectSync';

const require_ = createRequire(import.meta.url);

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── node-pty (lazy) ──────────────────────────────────────────────────────────
// Loaded on first pty:create so a missing/ABI-broken native addon can never
// take the server down at import time. If it will not load, a child_process
// fallback provides pipe-based I/O (no tty semantics, but a usable shell).

interface RawPty {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(cb: (data: string) => void): unknown;
  onExit(cb: () => void): unknown;
}

interface NodePtyModule {
  spawn(
    file: string,
    args: string[],
    opts: { name?: string; cols?: number; rows?: number; cwd?: string; env?: Record<string, string> },
  ): RawPty;
}

interface PtyLike {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

let ptyModule: NodePtyModule | null = null;
let ptyLoadAttempted = false;
let ptyLoadError: string | null = null;

function loadPty(): NodePtyModule | null {
  if (ptyLoadAttempted) return ptyModule;
  ptyLoadAttempted = true;
  try {
    ptyModule = require_('node-pty') as NodePtyModule;
    if (typeof ptyModule.spawn !== 'function') throw new Error('node-pty has no spawn()');
  } catch (e) {
    ptyModule = null;
    ptyLoadError = errText(e);
    console.warn(`[bridge] node-pty unavailable (${ptyLoadError}) — falling back to piped shell`);
  }
  return ptyModule;
}

// ── chokidar (lazy, optional) ────────────────────────────────────────────────
// Resolved out of the parent repo's node_modules when present; fs.watch is the
// fallback. Both produce the same `fs:changed` payload as main.ts.

interface ChokidarWatcher {
  on(event: string, cb: (...args: unknown[]) => void): ChokidarWatcher;
  close(): Promise<void> | void;
}
interface ChokidarModule {
  watch(target: string, opts: Record<string, unknown>): ChokidarWatcher;
}

let chokidarModule: ChokidarModule | null = null;
let chokidarAttempted = false;

function loadChokidar(): ChokidarModule | null {
  if (chokidarAttempted) return chokidarModule;
  chokidarAttempted = true;
  try {
    const mod = require_('chokidar') as ChokidarModule & { default?: ChokidarModule };
    const resolved = typeof mod.watch === 'function' ? mod : (mod.default ?? null);
    chokidarModule = resolved && typeof resolved.watch === 'function' ? resolved : null;
  } catch {
    chokidarModule = null;
  }
  return chokidarModule;
}

// ── options ──────────────────────────────────────────────────────────────────

export interface BridgeOptions {
  /** GHOSTED2_ROOT — seeds the grant set and is reported in the `ready` frame */
  root: string;
  /** shared with the mission-control WebSocket in index.ts */
  host: AcpHost;
}

export interface Bridge {
  /** the /bridge WebSocketServer — index.ts routes upgrades into it */
  wss: WebSocketServer;
  /** fan an AcpHost broadcast out to bridge clients as acp:* pushes */
  acpBroadcast(msg: ServerMsg): void;
  /** kill PTYs, close watchers, stop the PM poller */
  shutdown(): void;
}

export function createBridge(opts: BridgeOptions): Bridge {
  const root = path.resolve(opts.root);
  const host = opts.host;

  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();

  function send(ws: WebSocket, msg: BridgeServerMsg): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  /** every bridge client sees every push — tabs are interchangeable */
  function push(ch: string, ...args: unknown[]): void {
    const data = JSON.stringify({ t: 'push', ch, args });
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  // ── workspace grants (mirrors main.ts isAllowedPath/assertAllowed) ─────────

  const grants = new Set<string>([root]);

  function grantRoot(dir: string): string {
    const resolved = path.resolve(dir);
    grants.add(resolved);
    return resolved;
  }

  function isAllowedPath(p: unknown): boolean {
    if (typeof p !== 'string' || p.length === 0) return false;
    const resolved = path.resolve(p);
    for (const g of grants) {
      if (resolved === g || resolved.startsWith(g + path.sep)) return true;
    }
    return false;
  }

  function assertAllowed(p: unknown): string {
    if (!isAllowedPath(p)) throw new Error('Access denied: path is outside granted workspace roots');
    return path.resolve(p as string);
  }

  // ── file watchers ─────────────────────────────────────────────────────────

  interface WatchHandle {
    close(): void;
  }
  const watchers = new Map<string, WatchHandle>();

  function startWatch(dirPath: string): boolean {
    const chokidar = loadChokidar();
    if (chokidar) {
      try {
        const w = chokidar.watch(dirPath, {
          cwd: dirPath,
          ignoreInitial: true,
          ignored: /(^|[/\\])(\.git|node_modules)([/\\]|$)/,
        });
        w.on('all', (...a: unknown[]) => {
          const event = String(a[0] ?? '');
          const filename = String(a[1] ?? '');
          if (!filename) return;
          const eventType = event === 'change' ? 'change' : 'rename';
          push('fs:changed', { dir: dirPath, eventType, filename });
        });
        w.on('error', () => {});
        watchers.set(dirPath, {
          close: () => {
            void w.close();
          },
        });
        return true;
      } catch {
        // fall through to fs.watch
      }
    }
    try {
      const w = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (filename) push('fs:changed', { dir: dirPath, eventType, filename });
      });
      watchers.set(dirPath, { close: () => w.close() });
      return true;
    } catch {
      return false;
    }
  }

  // ── terminals ─────────────────────────────────────────────────────────────

  const terminals = new Map<string, PtyLike>();

  function createTerminal(id: string, cwd: string, cols: number, rows: number): PtyLike {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string') env[k] = v;
    }
    // GHOSTED_SOCKET is Electron-only (the terminal RPC socket) — omit on web.
    delete env.GHOSTED_SOCKET;
    env.TERM = 'xterm-256color';

    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';
    const mod = loadPty();

    if (mod) {
      const term = mod.spawn(shell, [], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: cwd || os.homedir(),
        env,
      });
      term.onData((data: string) => push(`pty:data:${id}`, data));
      term.onExit(() => {
        terminals.delete(id);
        push(`pty:exit:${id}`);
      });
      return {
        write: (data) => term.write(data),
        resize: (c, r) => term.resize(c, r),
        kill: () => term.kill(),
      };
    }

    // Fallback: piped shell. Functional I/O, no tty — resize is a no-op.
    const child = spawnChild(shell, ['-i'], {
      cwd: cwd || os.homedir(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (b: Buffer) => push(`pty:data:${id}`, b.toString('utf-8')));
    child.stderr?.on('data', (b: Buffer) => push(`pty:data:${id}`, b.toString('utf-8')));
    const onGone = (): void => {
      terminals.delete(id);
      push(`pty:exit:${id}`);
    };
    child.on('exit', onGone);
    child.on('error', onGone);
    return {
      write: (data) => {
        child.stdin?.write(data);
      },
      resize: () => {},
      kill: () => child.kill(),
    };
  }

  // ── git ───────────────────────────────────────────────────────────────────

  function git(cwd: string, args: string[]): string {
    return execFileSync('git', args, {
      cwd: assertAllowed(cwd),
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();
  }

  function repoRemote(cwd: string): { owner: string; name: string } | null {
    try {
      const url = git(cwd, ['remote', 'get-url', 'origin']);
      const ssh = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      return ssh ? { owner: ssh[1], name: ssh[2] } : null;
    } catch {
      return null;
    }
  }

  // ── PM (GitHub Projects v2) ───────────────────────────────────────────────
  // Real reuse of electron/projectSync.ts — it is electron-free. Op-queue json
  // lands in a temp data dir. If the import ever fails we degrade to a 'no-gh'
  // snapshot so the renderer falls back to local mode instead of erroring.

  const PM_DATA_DIR = path.join(os.tmpdir(), 'ghosted2-pm');
  const PM_OP_KINDS = new Set(['setStatus', 'setPriority', 'setDate', 'reorder', 'create']);

  const PM_FALLBACK: PmSnapshot = {
    status: 'no-gh',
    error: null,
    repo: null,
    projects: [],
    selectedProject: null,
    fields: null,
    items: [],
    pendingOps: 0,
    pendingItemIds: [],
    failedOps: 0,
    lastSyncedAt: null,
    rateLimit: null,
  };

  let pmService: ProjectSyncService | null = null;
  let pmDegraded = false;

  async function getPm(): Promise<ProjectSyncService | null> {
    if (pmService) return pmService;
    if (pmDegraded) return null;
    try {
      fs.mkdirSync(PM_DATA_DIR, { recursive: true });
      const mod = await import('../../electron/projectSync');
      pmService = new mod.ProjectSyncService({
        userDataDir: PM_DATA_DIR,
        getRepoRemote: repoRemote,
        onUpdate: (snapshot) => push('pm:update', snapshot),
      });
      return pmService;
    } catch (e) {
      pmDegraded = true;
      console.warn(`[bridge] projectSync unavailable (${errText(e)}) — pm:* degraded to no-gh`);
      return null;
    }
  }

  // ── channel table ─────────────────────────────────────────────────────────

  // `workspace:initial` mirrors the CLI-handoff semantics: the root is offered
  // once, then null — a reload must go through workspace:restore instead.
  let initialHandedOut = false;

  type Handler = (args: unknown[]) => unknown;

  const channels: Record<string, Handler> = {
    // ---- fs ----
    'fs:readdir': (a) => {
      const dir = assertAllowed(a[0]);
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries.map((e) => ({
        name: e.name,
        path: path.join(dir, e.name),
        isDirectory: e.isDirectory(),
      }));
    },
    'fs:readfile': (a) => fs.readFileSync(assertAllowed(a[0]), 'utf-8'),
    'fs:writefile': (a) => {
      fs.writeFileSync(assertAllowed(a[0]), String(a[1] ?? ''), 'utf-8');
      return true;
    },
    'fs:homedir': () => os.homedir(),
    'fs:mkdir': (a) => {
      fs.mkdirSync(assertAllowed(a[0]), { recursive: true });
      return true;
    },
    'fs:newfile': (a) => {
      fs.writeFileSync(assertAllowed(a[0]), (a[1] as string | undefined) ?? '', 'utf-8');
      return true;
    },
    'fs:rename': (a) => {
      fs.renameSync(assertAllowed(a[0]), assertAllowed(a[1]));
      return true;
    },
    'fs:delete': (a) => {
      const target = assertAllowed(a[0]);
      const stat = fs.statSync(target);
      if (stat.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
      else fs.unlinkSync(target);
      return true;
    },
    'fs:copy': (a) => {
      fs.cpSync(assertAllowed(a[0]), assertAllowed(a[1]), { recursive: true });
      return true;
    },
    'fs:exists': (a) => isAllowedPath(a[0]) && fs.existsSync(path.resolve(a[0] as string)),
    'fs:stat': (a) => {
      try {
        const stat = fs.statSync(assertAllowed(a[0]));
        return {
          isDirectory: stat.isDirectory(),
          isFile: stat.isFile(),
          size: stat.size,
          mtime: stat.mtimeMs,
        };
      } catch {
        return null;
      }
    },
    'fs:watch': (a) => {
      const dirPath = a[0];
      if (!isAllowedPath(dirPath)) return false;
      const key = dirPath as string;
      if (watchers.has(key)) return true;
      return startWatch(key);
    },
    'fs:unwatch': (a) => {
      const key = a[0] as string;
      const w = watchers.get(key);
      if (w) {
        w.close();
        watchers.delete(key);
      }
      return true;
    },
    // Electron-only: a browser cannot prove a File came from a real OS drop.
    'fs:grantDropped': () => false,

    // ---- workspace ----
    'workspace:initial': () => {
      if (initialHandedOut) return null;
      initialHandedOut = true;
      return root;
    },
    'workspace:restore': (a) => {
      const dir = a[0];
      if (typeof dir !== 'string' || !dir) return false;
      const resolved = path.resolve(dir);
      if (isAllowedPath(resolved)) return true;
      try {
        const stat = fs.statSync(resolved);
        const isFsRoot = resolved === path.parse(resolved).root;
        if (stat.isDirectory() && !isFsRoot && resolved !== os.homedir()) {
          grantRoot(resolved);
          return true;
        }
      } catch {}
      return false;
    },

    // ---- web-only: the shim's replacement for the native folder picker ----
    'web:grantPath': (a) => {
      const p = a[0];
      if (typeof p !== 'string' || !p) return null;
      const resolved = path.resolve(p);
      try {
        if (!fs.statSync(resolved).isDirectory()) return null;
      } catch {
        return null;
      }
      return grantRoot(resolved);
    },

    // ---- dialog / shell / cli: no OS surface on the web ----
    'dialog:openFolder': () => null,
    'dialog:openFile': () => null,
    'dialog:saveFile': () => null,
    'shell:openExternal': () => undefined,
    'shell:showItemInFolder': () => undefined,
    'cli:install': () => ({ ok: false, error: 'CLI install is not available in the browser' }),

    // ---- pty ----
    'pty:create': (a) => {
      const id = a[0] as string;
      const cwd = (a[1] as string | undefined) ?? '';
      const cols = (a[2] as number | undefined) ?? 80;
      const rows = (a[3] as number | undefined) ?? 24;
      const existing = terminals.get(id);
      if (existing) {
        try {
          existing.kill();
        } catch {}
        terminals.delete(id);
      }
      try {
        const term = createTerminal(id, cwd, cols, rows);
        terminals.set(id, term);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: `spawn failed: ${errText(e)}` };
      }
    },
    'pty:write': (a) => {
      terminals.get(a[0] as string)?.write(String(a[1] ?? ''));
    },
    'pty:resize': (a) => {
      terminals.get(a[0] as string)?.resize((a[1] as number) || 80, (a[2] as number) || 24);
    },
    'pty:kill': (a) => {
      const id = a[0] as string;
      try {
        terminals.get(id)?.kill();
      } catch {}
      terminals.delete(id);
    },

    // ---- git ----
    'git:log': (a) => {
      try {
        const count = (a[1] as number | undefined) ?? 50;
        const SEP = '<<GH_SEP>>';
        const fmt = ['%H', '%h', '%an', '%ae', '%ar', '%s', '%D', '%P'].join(SEP);
        const raw = git(a[0] as string, ['log', `--format=${fmt}`, '--all', '-n', String(count)]);
        if (!raw) return [];
        return raw
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [hash, shortHash, author, email, date, subject, refs, parents] = line.split(SEP);
            return {
              hash,
              shortHash,
              author,
              email,
              date,
              subject,
              refs,
              parents: parents?.split(' ').filter(Boolean) ?? [],
            };
          });
      } catch {
        return [];
      }
    },
    'git:status': (a) => {
      try {
        const raw = git(a[0] as string, ['status', '--porcelain=v1', '-uall']);
        if (!raw) return [];
        return raw.split('\n').map((line) => ({
          x: line[0],
          y: line[1],
          path: line.slice(3),
        }));
      } catch {
        return [];
      }
    },
    'git:branch': (a) => {
      try {
        return git(a[0] as string, ['branch', '--show-current']);
      } catch {
        return '';
      }
    },
    'git:diffSummary': (a) => {
      try {
        const cwd = a[0] as string;
        let diff = '';
        try {
          diff = git(cwd, ['diff', '--cached', '--stat']);
        } catch {}
        if (!diff)
          try {
            diff = git(cwd, ['diff', '--stat']);
          } catch {}
        let untracked = '';
        try {
          untracked = git(cwd, ['ls-files', '--others', '--exclude-standard']);
        } catch {}
        return { diff, untracked };
      } catch {
        return { diff: '', untracked: '' };
      }
    },
    'git:remote': (a) => {
      const remote = repoRemote(a[0] as string);
      return remote ? { owner: remote.owner, repo: remote.name } : null;
    },
    'git:aheadBehind': (a) => {
      try {
        const raw = git(a[0] as string, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']);
        const [ahead, behind] = raw.split(/\s+/).map(Number);
        return { ahead: ahead || 0, behind: behind || 0 };
      } catch {
        return { ahead: 0, behind: 0 };
      }
    },
    'git:stage': (a) => {
      try {
        git(a[0] as string, ['add', '--', a[1] as string]);
        return true;
      } catch {
        return false;
      }
    },
    'git:unstage': (a) => {
      try {
        git(a[0] as string, ['reset', 'HEAD', '--', a[1] as string]);
        return true;
      } catch {
        return false;
      }
    },
    'git:stageAll': (a) => {
      try {
        git(a[0] as string, ['add', '-A']);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: execErr(err) };
      }
    },
    'git:commit': (a) => {
      try {
        git(a[0] as string, ['commit', '-m', a[1] as string]);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: execErr(err) };
      }
    },
    'git:push': (a) => {
      try {
        git(a[0] as string, ['push']);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: execErr(err) };
      }
    },
    'git:pull': (a) => {
      try {
        git(a[0] as string, ['pull']);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: execErr(err) };
      }
    },
    'git:discard': (a) => {
      try {
        git(a[0] as string, ['checkout', '--', a[1] as string]);
        return true;
      } catch {
        return false;
      }
    },
    'gh:run': (a) => {
      try {
        const parsed = parseArgs(String(a[1] ?? ''));
        const result = execFileSync('gh', parsed, {
          cwd: assertAllowed(a[0]),
          encoding: 'utf-8',
          timeout: 15000,
        }).trim();
        return { ok: true, data: result };
      } catch (err) {
        return { ok: false, error: errText(err) };
      }
    },

    // ---- db: stubbed (no indexer on the web yet; renderer tolerates empties) ----
    'db:index': (a) => ({
      total: 0,
      byExt: {},
      withFrontmatter: 0,
      workspace: typeof a[0] === 'string' ? a[0] : root,
    }),
    'db:stats': () => ({ total: 0, byExt: {}, withFrontmatter: 0, workspace: root }),
    'db:query': () => ({ files: [], total: 0, took: 0 }),
    'db:get': () => null,

    // ---- pm ----
    'pm:connect': async (a) => {
      const svc = await getPm();
      if (!svc) return PM_FALLBACK;
      return svc.connect(assertAllowed(a[0]));
    },
    'pm:select': async (a) => {
      if (typeof a[0] !== 'number') return;
      const svc = await getPm();
      await svc?.selectProject(a[0]);
    },
    'pm:refresh': async () => {
      const svc = await getPm();
      await svc?.refresh();
    },
    'pm:state': async () => {
      const svc = await getPm();
      return svc ? svc.snapshot() : PM_FALLBACK;
    },
    'pm:visibility': async (a) => {
      const svc = await getPm();
      svc?.setVisible(Boolean(a[0]));
    },
    'pm:op': async (a) => {
      const o = a[0] as { kind?: string; opId?: string; itemId?: string; attempts?: number } | null;
      if (!o || typeof o !== 'object' || !PM_OP_KINDS.has(String(o.kind))) return false;
      if (typeof o.opId !== 'string' || typeof o.itemId !== 'string') return false;
      const svc = await getPm();
      if (!svc) return false;
      o.attempts = 0;
      svc.enqueue(o as PmOp);
      return true;
    },

    // ---- acp ----
    'acp:agents': () => listAgents(),
    'acp:sessions': () => host.getSessions(),
    'acp:create': (a) => {
      const p = (a[0] ?? {}) as { agentId?: string; cwd?: string };
      if (typeof p.agentId !== 'string' || !p.agentId) throw new Error('acp:create needs an agentId');
      return host.createSession(p.agentId, p.cwd);
    },
    'acp:prompt': (a) => {
      const p = (a[0] ?? {}) as { sessionId?: string; text?: string };
      if (typeof p.sessionId !== 'string') throw new Error('acp:prompt needs a sessionId');
      // Fire-and-forget: the turn's end is signalled by an acp:status push.
      void host.prompt(p.sessionId, String(p.text ?? '')).catch(() => {});
    },
    'acp:cancel': (a) => {
      const p = (a[0] ?? {}) as { sessionId?: string };
      if (typeof p.sessionId !== 'string') throw new Error('acp:cancel needs a sessionId');
      return host.cancel(p.sessionId);
    },
    'acp:decide': (a) => {
      const p = (a[0] ?? {}) as { sessionId?: string; requestId?: string; optionId?: string };
      if (typeof p.sessionId !== 'string' || typeof p.requestId !== 'string') {
        throw new Error('acp:decide needs sessionId and requestId');
      }
      host.resolvePermission(p.sessionId, p.requestId, String(p.optionId ?? ''));
    },
  };

  // ── connection handling ───────────────────────────────────────────────────

  async function dispatch(ws: WebSocket, msg: BridgeInvoke): Promise<void> {
    const handler = channels[msg.ch];
    if (!handler) {
      send(ws, { t: 'res', id: msg.id, ok: false, error: `channel not supported on web: ${msg.ch}` });
      return;
    }
    try {
      const result = await handler(Array.isArray(msg.args) ? msg.args : []);
      send(ws, { t: 'res', id: msg.id, ok: true, result });
    } catch (e) {
      send(ws, { t: 'res', id: msg.id, ok: false, error: errText(e) });
    }
  }

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    send(ws, { t: 'ready', root });

    // Replay the ACP world so a fresh tab is indistinguishable from a live one
    // (same contract as the mission-control socket in index.ts).
    for (const session of host.getSessions()) send(ws, { t: 'push', ch: 'acp:session', args: [session] });
    for (const record of host.getHistory()) send(ws, { t: 'push', ch: 'acp:update', args: [record] });
    for (const request of host.getPendingPermissions()) {
      send(ws, { t: 'push', ch: 'acp:permission', args: [request] });
    }

    ws.on('message', (data: unknown) => {
      let msg: BridgeInvoke;
      try {
        msg = JSON.parse(String(data)) as BridgeInvoke;
      } catch {
        return;
      }
      if (!msg || msg.t !== 'inv' || typeof msg.id !== 'number' || typeof msg.ch !== 'string') return;
      void dispatch(ws, msg);
    });

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  // ── acp fan-out ───────────────────────────────────────────────────────────

  function acpBroadcast(msg: ServerMsg): void {
    switch (msg.type) {
      case 'session.update':
        push('acp:update', msg.record);
        break;
      case 'session.status':
        push('acp:status', { sessionId: msg.sessionId, status: msg.status, error: msg.error });
        break;
      case 'permission.request':
        push('acp:permission', msg.request);
        break;
      case 'permission.resolved':
        push('acp:permission-resolved', { sessionId: msg.sessionId, requestId: msg.requestId });
        break;
      case 'session.created':
        push('acp:session', msg.session);
        break;
      default:
        break;
    }
  }

  function shutdown(): void {
    for (const term of terminals.values()) {
      try {
        term.kill();
      } catch {}
    }
    terminals.clear();
    for (const w of watchers.values()) {
      try {
        w.close();
      } catch {}
    }
    watchers.clear();
    pmService?.destroy();
    wss.close();
  }

  return { wss, acpBroadcast, shutdown };
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** execFileSync errors carry stderr/stdout — mirror main.ts's message picking. */
function execErr(err: unknown): string {
  const e = err as { stderr?: unknown; stdout?: unknown; message?: unknown };
  const stderr = typeof e?.stderr === 'string' ? e.stderr.trim() : '';
  const stdout = typeof e?.stdout === 'string' ? e.stdout.trim() : '';
  return stderr || stdout || errText(err);
}

/** Split a gh argument string on spaces, respecting quotes (copy of main.ts). */
function parseArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) args.push(current);
  return args;
}
