// Ghosted 2.0 — WebSocket wire contract between server (ACP host) and web UI.
// This file is the single source of truth. Both sides import from here.
// The ACP session/update payloads are forwarded RAW from the agent — the UI
// narrows them structurally (see AcpUpdate below) rather than re-modeling them.

export const WS_PORT = 4821;
export const WS_URL = `ws://localhost:${WS_PORT}`;

// ---------- domain ----------

export type SessionStatus =
  | 'starting'
  | 'idle'
  | 'running'
  | 'awaiting-permission'
  | 'done'
  | 'error'
  | 'exited';

export interface AgentInfo {
  id: string;
  name: string;
  /** true when the underlying command exists on this machine */
  available: boolean;
  description?: string;
}

export interface SessionMeta {
  id: string;
  agentId: string;
  agentName: string;
  cwd: string;
  createdAt: number;
  status: SessionStatus;
  /** last error message when status === 'error' */
  error?: string;
  /**
   * How permission requests are handled for this session.
   *   'safe'    — most restrictive agent mode when one is advertised, else 'default'
   *   'default' — every request is forwarded to the UI (the historical behaviour)
   *   'full'    — allow-ish options are auto-selected; nothing blocks on the UI
   */
  permissionMode?: 'safe' | 'default' | 'full';
}

export interface PermissionOption {
  optionId: string;
  name: string;
  kind?: string; // e.g. 'allow_once' | 'allow_always' | 'reject_once'
}

export interface PermissionRequest {
  sessionId: string;
  requestId: string;
  /** raw ACP toolCall payload if present */
  toolCall?: unknown;
  title?: string;
  options: PermissionOption[];
}

/**
 * Structural narrowing of ACP session/update notification payloads (v1).
 * The server forwards `params.update` verbatim; these cover what the UI renders.
 * Anything unrecognized must be tolerated (render nothing / a debug row).
 */
export type AcpUpdate =
  | { sessionUpdate: 'agent_message_chunk'; content?: AcpContent }
  | { sessionUpdate: 'agent_thought_chunk'; content?: AcpContent }
  | { sessionUpdate: 'user_message_chunk'; content?: AcpContent }
  | {
      sessionUpdate: 'tool_call';
      toolCallId: string;
      title?: string;
      kind?: string; // read | edit | execute | search | fetch | think | other
      status?: string; // pending | in_progress | completed | failed
      locations?: { path: string; line?: number }[];
      rawInput?: unknown;
    }
  | {
      sessionUpdate: 'tool_call_update';
      toolCallId: string;
      status?: string;
      title?: string;
      content?: unknown;
      locations?: { path: string; line?: number }[];
    }
  | { sessionUpdate: 'plan'; entries?: { content: string; status?: string; priority?: string }[] }
  | { sessionUpdate: string; [k: string]: unknown }; // forward-compat catch-all

export interface AcpContent {
  type?: string; // 'text' | ...
  text?: string;
  [k: string]: unknown;
}

export interface UpdateRecord {
  sessionId: string;
  seq: number;
  ts: number;
  update: AcpUpdate;
}

// ---------- client -> server ----------

export type ClientMsg =
  | { type: 'agents.list' }
  | { type: 'sessions.list' }
  | { type: 'session.new'; agentId: string; cwd?: string }
  | { type: 'session.prompt'; sessionId: string; text: string }
  | { type: 'session.cancel'; sessionId: string }
  | { type: 'permission.decision'; sessionId: string; requestId: string; optionId: string };

// ---------- server -> client ----------

export type ServerMsg =
  | { type: 'hello'; workspaceRoot: string }
  | { type: 'agents.list'; agents: AgentInfo[] }
  | { type: 'sessions.list'; sessions: SessionMeta[] }
  | { type: 'session.created'; session: SessionMeta }
  | { type: 'session.status'; sessionId: string; status: SessionStatus; error?: string }
  | { type: 'session.update'; record: UpdateRecord }
  | { type: 'permission.request'; request: PermissionRequest }
  | { type: 'permission.resolved'; sessionId: string; requestId: string; optionId: string }
  | { type: 'error'; message: string; sessionId?: string };

// ---------- graph (derived client-side; types shared so UI + graph agree) ----------

export type GraphNodeKind = 'agent' | 'tool' | 'file';
export type GraphNodeStatus = 'active' | 'blocked' | 'done' | 'error' | 'idle';

export interface GraphNode {
  id: string; // agent:<sessionId> | tool:<sessionId>:<toolCallId> | file:<path>
  kind: GraphNodeKind;
  label: string;
  status: GraphNodeStatus;
  sessionId?: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
