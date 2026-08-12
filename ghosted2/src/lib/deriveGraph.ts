// Pure derivation: server-forwarded session/update/permission state -> GraphData.
// No side effects, no DOM, no force-graph — just a structural fold so it's
// trivially unit-testable and safe to call from a useMemo on every tick.

import type {
  AcpUpdate,
  GraphData,
  GraphLink,
  GraphNode,
  GraphNodeStatus,
  PermissionRequest,
  SessionMeta,
  SessionStatus,
  UpdateRecord,
} from '../../shared/protocol'

// ---------- status mapping ----------

function mapSessionStatus(status: SessionStatus): GraphNodeStatus {
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

function mapToolStatus(status: string | undefined): GraphNodeStatus {
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
 * Fold sessions/updates/pendingPermissions into a GraphData snapshot.
 * Single O(n) pass over `updates` to accumulate per-tool state, then O(1)
 * map lookups to resolve tool status, permission blocking, and file
 * convergence (same path touched by multiple sessions -> same file node).
 */
export function deriveGraph(
  sessions: SessionMeta[],
  updates: UpdateRecord[],
  pendingPermissions: PermissionRequest[],
): GraphData {
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
  const toolStatus = new Map<string, GraphNodeStatus>()
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

  const nodes: GraphNode[] = []
  const links: GraphLink[] = []

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
      links.push({ source: `agent:${entry.sessionId}`, target: id })
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
      links.push({ source: id, target: `file:${path}` })
    }
  }

  return { nodes, links }
}
