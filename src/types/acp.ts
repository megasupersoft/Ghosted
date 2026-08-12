// Renderer-local copy of the ACP (Agent Client Protocol) domain types shared
// with the ghosted2 standalone host — see ghosted2/shared/protocol.ts, the
// source of truth. Copied rather than imported across the package boundary.

export type SessionStatus =
  | 'starting'
  | 'idle'
  | 'running'
  | 'awaiting-permission'
  | 'done'
  | 'error'
  | 'exited'

export interface AgentInfo {
  id: string
  name: string
  /** true when the underlying command exists on this machine */
  available: boolean
  description?: string
}

export interface SessionMeta {
  id: string
  agentId: string
  agentName: string
  cwd: string
  createdAt: number
  status: SessionStatus
  /** last error message when status === 'error' */
  error?: string
}

export interface PermissionOption {
  optionId: string
  name: string
  kind?: string // e.g. 'allow_once' | 'allow_always' | 'reject_once'
}

export interface PermissionRequest {
  sessionId: string
  requestId: string
  /** raw ACP toolCall payload if present */
  toolCall?: unknown
  title?: string
  options: PermissionOption[]
}

/**
 * Structural narrowing of ACP session/update notification payloads (v1).
 * The host forwards `params.update` verbatim; these cover what the UI renders.
 * Anything unrecognized must be tolerated (render nothing / a debug row).
 */
export type AcpUpdate =
  | { sessionUpdate: 'agent_message_chunk'; content?: AcpContent }
  | { sessionUpdate: 'agent_thought_chunk'; content?: AcpContent }
  | { sessionUpdate: 'user_message_chunk'; content?: AcpContent }
  | {
      sessionUpdate: 'tool_call'
      toolCallId: string
      title?: string
      kind?: string // read | edit | execute | search | fetch | think | other
      status?: string // pending | in_progress | completed | failed
      locations?: { path: string; line?: number }[]
      rawInput?: unknown
    }
  | {
      sessionUpdate: 'tool_call_update'
      toolCallId: string
      status?: string
      title?: string
      content?: unknown
      locations?: { path: string; line?: number }[]
    }
  | { sessionUpdate: 'plan'; entries?: { content: string; status?: string; priority?: string }[] }
  | { sessionUpdate: string; [k: string]: unknown } // forward-compat catch-all

export interface AcpContent {
  type?: string // 'text' | ...
  text?: string
  [k: string]: unknown
}

export interface UpdateRecord {
  sessionId: string
  seq: number
  ts: number
  update: AcpUpdate
}
