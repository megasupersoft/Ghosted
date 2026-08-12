// Pure derivation: live agent session/update/permission state -> graph nodes
// + links, in the same node/link object shape GraphPane's force-graph
// renderer consumes (id/label, extended with kind/status for agent-mode
// painting). No side effects, no DOM, no force-graph — a structural fold,
// ported from ghosted2/src/lib/deriveGraph.ts so it's trivially
// unit-testable and safe to call from a selector/effect on every store tick.
//
// Type note: src/types/acp.ts did not exist yet at the time this file was
// written (a parallel worker was still landing it), so the ACP/session/update
// shapes below are local copies of ghosted2/shared/protocol.ts. They are
// structurally identical to src/types/acp.ts (verified once that module
// landed — `npm run typecheck` is green feeding real useAgentsStore data
// through deriveAgentGraph), so this file's local types and the renderer's
// canonical src/types/acp.ts satisfy each other via structural typing with
// no changes needed here. Could be swapped to `import type {...} from
// '../types/acp'` now for single-source-of-truth; left local since this
// module is meant to stay a dependency-free pure fold (easy to unit test).

// ---------- local copies of shared/protocol.ts shapes ----------

export type SessionStatus =
  | 'starting'
  | 'idle'
  | 'running'
  | 'awaiting-permission'
  | 'done'
  | 'error'
  | 'exited'

export interface SessionMeta {
  id: string
  agentId: string
  agentName: string
  cwd: string
  createdAt: number
  status: SessionStatus
  error?: string
}

export interface PermissionOption {
  optionId: string
  name: string
  kind?: string
}

export interface PermissionRequest {
  sessionId: string
  requestId: string
  toolCall?: unknown
  title?: string
  options: PermissionOption[]
}

export interface AcpContent {
  type?: string
  text?: string
  [k: string]: unknown
}

export type AcpUpdate =
  | { sessionUpdate: 'agent_message_chunk'; content?: AcpContent }
  | { sessionUpdate: 'agent_thought_chunk'; content?: AcpContent }
  | { sessionUpdate: 'user_message_chunk'; content?: AcpContent }
  | {
      sessionUpdate: 'tool_call'
      toolCallId: string
      title?: string
      kind?: string
      status?: string
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
  | { sessionUpdate: string; [k: string]: unknown }

export interface UpdateRecord {
  sessionId: string
  seq: number
  ts: number
  update: AcpUpdate
}

// ---------- graph output shapes (match GraphPane's node/link conventions) ----------

export type AgentGraphNodeKind = 'agent' | 'tool' | 'file'
export type AgentGraphNodeStatus = 'active' | 'blocked' | 'done' | 'error' | 'idle'

/** Same id/label shape GraphPane's file-mode nodes use, extended for agent-mode painting. */
export interface AgentGraphNode {
  id: string // agent:<sessionId> | tool:<sessionId>:<toolCallId> | file:<path>
  label: string
  kind: AgentGraphNodeKind
  status: AgentGraphNodeStatus
  sessionId?: string
}

/** Same id/source/target shape GraphPane's file-mode edges use. */
export interface AgentGraphLink {
  id: string
  source: string
  target: string
}

export interface AgentGraphData {
  nodes: AgentGraphNode[]
  links: AgentGraphLink[]
}

// ---------- status mapping ----------

function mapSessionStatus(status: SessionStatus): AgentGraphNodeStatus {
  switch (status) {
    case 'running':
      return 'active'
    case 'awaiting-permission':
      return 'blocked'
    case 'error':
    case 'exited':
      return 'error'
    case 'starting':
      return 'idle'
    case 'idle':
    case 'done':
      return 'done'
    default:
      return 'idle'
  }
}

function mapToolStatus(status: string | undefined): AgentGraphNodeStatus {
  switch (status) {
    case 'pending':
    case 'in_progress':
      return 'active'
    case 'completed':
      return 'done'
    case 'failed':
      return 'error'
    case undefined:
      // tool_call raised with no explicit status yet — treat as freshly active.
      return 'active'
    default:
      // Unrecognized status string: don't claim activity we can't confirm.
      return 'idle'
  }
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

function extractToolCallId(toolCall: unknown): string | undefined {
  if (toolCall && typeof toolCall === 'object' && 'toolCallId' in toolCall) {
    const id = (toolCall as { toolCallId?: unknown }).toolCallId
    return typeof id === 'string' ? id : undefined
  }
  return undefined
}

function toolNodeId(sessionId: string, toolCallId: string): string {
  return `tool:${sessionId}:${toolCallId}`
}

// AcpUpdate's catch-all member (`{ sessionUpdate: string; ... }`) has a
// discriminant that's a bare `string`, not a disjoint literal, so a plain
// `update.sessionUpdate === 'tool_call'` control-flow check can't exclude it
// from the narrowed type. Extract<> (a type-level assignability check, not
// control flow) does exclude it, so route narrowing through named guards.
function isToolCall(u: AcpUpdate): u is Extract<AcpUpdate, { sessionUpdate: 'tool_call' }> {
  return u.sessionUpdate === 'tool_call'
}

function isToolCallUpdate(u: AcpUpdate): u is Extract<AcpUpdate, { sessionUpdate: 'tool_call_update' }> {
  return u.sessionUpdate === 'tool_call_update'
}

// ---------- internal accumulator ----------

interface ToolEntry {
  sessionId: string
  toolCallId: string
  title?: string
  kind?: string
  status?: string
  locations: Set<string>
}

/**
 * Fold sessions/updates/pendingPermissions into an AgentGraphData snapshot.
 * Single O(n) pass over `updates` to accumulate per-tool state, then O(1)
 * map lookups to resolve tool status, permission blocking, and file
 * convergence (same path touched by multiple sessions -> same file node).
 */
export function deriveAgentGraph(
  sessions: SessionMeta[],
  updates: UpdateRecord[],
  pendingPermissions: PermissionRequest[],
): AgentGraphData {
  const sessionById = new Map<string, SessionMeta>()
  for (const session of sessions) sessionById.set(session.id, session)

  const toolEntries = new Map<string, ToolEntry>() // key: tool node id

  for (const record of updates) {
    const { sessionId, update } = record

    if (isToolCall(update)) {
      const id = toolNodeId(sessionId, update.toolCallId)
      const entry: ToolEntry = toolEntries.get(id) ?? {
        sessionId,
        toolCallId: update.toolCallId,
        locations: new Set<string>(),
      }
      if (update.title !== undefined) entry.title = update.title
      if (update.kind !== undefined) entry.kind = update.kind
      if (update.status !== undefined) entry.status = update.status
      for (const loc of update.locations ?? []) entry.locations.add(loc.path)
      toolEntries.set(id, entry)
    } else if (isToolCallUpdate(update)) {
      const id = toolNodeId(sessionId, update.toolCallId)
      const entry: ToolEntry = toolEntries.get(id) ?? {
        sessionId,
        toolCallId: update.toolCallId,
        locations: new Set<string>(),
      }
      // Later records win: only overwrite fields this record actually carries.
      if (update.title !== undefined) entry.title = update.title
      if (update.status !== undefined) entry.status = update.status
      for (const loc of update.locations ?? []) entry.locations.add(loc.path)
      toolEntries.set(id, entry)
    }
  }

  // Permission requests can (in theory) reference a tool call the update log
  // hasn't caught up with yet — make sure the node exists so 'blocked' has
  // somewhere to land, rather than silently dropping it.
  const blockedToolIds = new Set<string>()
  for (const perm of pendingPermissions) {
    const toolCallId = extractToolCallId(perm.toolCall)
    if (!toolCallId) continue
    const id = toolNodeId(perm.sessionId, toolCallId)
    if (!toolEntries.has(id)) {
      toolEntries.set(id, {
        sessionId: perm.sessionId,
        toolCallId,
        title: perm.title,
        locations: new Set<string>(),
      })
    }
    blockedToolIds.add(id)
  }

  // Resolve final tool status: a pending permission always wins over the
  // last-seen ACP status (an in_progress tool awaiting approval is blocked).
  const toolStatus = new Map<string, AgentGraphNodeStatus>()
  for (const [id, entry] of toolEntries) {
    toolStatus.set(id, blockedToolIds.has(id) ? 'blocked' : mapToolStatus(entry.status))
  }

  // File convergence: path -> set of tool node ids that touched it. This is
  // what lets two agents editing the same file land on one shared node.
  const fileTools = new Map<string, Set<string>>()
  for (const [id, entry] of toolEntries) {
    for (const path of entry.locations) {
      let set = fileTools.get(path)
      if (!set) {
        set = new Set<string>()
        fileTools.set(path, set)
      }
      set.add(id)
    }
  }

  const nodes: AgentGraphNode[] = []
  const links: AgentGraphLink[] = []
  let linkId = 0
  const addLink = (source: string, target: string) => {
    links.push({ id: `ae${linkId++}`, source, target })
  }

  for (const session of sessions) {
    nodes.push({
      id: `agent:${session.id}`,
      kind: 'agent',
      label: session.agentName,
      status: mapSessionStatus(session.status),
      sessionId: session.id,
    })
  }

  for (const [id, entry] of toolEntries) {
    nodes.push({
      id,
      kind: 'tool',
      label: entry.title || entry.kind || entry.toolCallId,
      status: toolStatus.get(id) ?? 'idle',
      sessionId: entry.sessionId,
    })
    // Only link to an agent node that actually exists in this snapshot —
    // avoids a dangling link endpoint if a tool outlives its session record.
    if (sessionById.has(entry.sessionId)) {
      addLink(`agent:${entry.sessionId}`, id)
    }
  }

  for (const [path, toolIds] of fileTools) {
    const active = Array.from(toolIds).some((id) => toolStatus.get(id) === 'active')
    nodes.push({
      id: `file:${path}`,
      kind: 'file',
      label: basename(path),
      status: active ? 'active' : 'idle',
    })
    for (const id of toolIds) {
      addLink(id, `file:${path}`)
    }
  }

  return { nodes, links }
}
