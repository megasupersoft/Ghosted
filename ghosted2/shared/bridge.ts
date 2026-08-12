// Ghosted web bridge — wire contract for serving the renderer's
// `window.electron.*` surface over WebSocket (ws://localhost:4821/bridge).
//
// The channel names are EXACTLY the existing Electron IPC channel names
// (see electron/preload.ts + src/types/electron.d.ts in the parent repo),
// plus a new `acp:*` namespace for the agent host. The renderer-side shim
// (src/lib/webBridge.ts in the parent repo) maps the typed ElectronAPI onto
// this envelope 1:1.

import type {
  AgentInfo,
  PermissionRequest,
  SessionMeta,
  UpdateRecord,
} from './protocol';

// ---------- envelope ----------

/** client -> server: invoke a channel (mirrors ipcRenderer.invoke) */
export interface BridgeInvoke {
  t: 'inv';
  id: number;
  ch: string;
  args: unknown[];
}

/** server -> client: invoke result */
export interface BridgeResult {
  t: 'res';
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** server -> client: event push (mirrors webContents.send / ipcRenderer.on) */
export interface BridgePush {
  t: 'push';
  ch: string; // e.g. 'pty:data:term-3', 'fs:changed', 'acp:update'
  args: unknown[];
}

/** server -> client: sent once on connect */
export interface BridgeReady {
  t: 'ready';
  root: string; // workspace root the server is confined to
}

export type BridgeClientMsg = BridgeInvoke;
export type BridgeServerMsg = BridgeResult | BridgePush | BridgeReady;

export const BRIDGE_PATH = '/bridge';

// ---------- channel surface (MVP) ----------
// Implemented server-side; anything not listed must reject with a clear error
// so the shim can degrade gracefully.
//
// fs:readdir fs:readfile fs:writefile fs:homedir fs:mkdir fs:newfile
// fs:rename fs:delete fs:copy fs:exists fs:stat fs:watch fs:unwatch
//   push: fs:changed
// workspace:restore workspace:initial   (initial -> GHOSTED2_ROOT, once)
// web:grantPath                          (web-only: validate+grant an
//                                         absolute path typed by the user —
//                                         the shim's dialog fallback)
// pty:create pty:write pty:resize pty:kill
//   push: pty:data:{id}, pty:exit:{id}
// git:status git:branch git:stage git:unstage git:stageAll git:commit
// git:push git:pull git:discard git:log git:diffSummary git:aheadBehind
// git:remote gh:run
// db:index db:query db:get db:stats      (MAY be stubbed: empty results, no
//   push: db:changed                      throw — renderer tolerates)
// pm:connect pm:select pm:refresh pm:state pm:visibility pm:op
//   push: pm:update                      (reuse electron/projectSync.ts —
//                                         it is electron-free — else degrade
//                                         to status 'no-gh')
// acp:agents  -> AgentInfo[]
// acp:sessions -> SessionMeta[]
// acp:create { agentId: string } -> SessionMeta
// acp:prompt { sessionId, text } -> void (turn end signaled via acp:status)
// acp:cancel { sessionId }
// acp:decide { sessionId, requestId, optionId }
//   push: acp:update  [UpdateRecord]
//   push: acp:status  [{ sessionId, status, error? }]
//   push: acp:permission [PermissionRequest]
//   push: acp:permission-resolved [{ sessionId, requestId }]
//   push: acp:session [SessionMeta]     (session created)

// Re-export the ACP-side types the bridge carries so the server only needs
// one import site.
export type { AgentInfo, PermissionRequest, SessionMeta, UpdateRecord };
