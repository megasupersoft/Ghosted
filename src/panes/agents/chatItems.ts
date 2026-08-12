// Ported from ghosted2/src/lib/chatItems.ts — turns a session's flat
// UpdateRecord stream into renderable chat items. Logic is unchanged from the
// standalone; only the import source (renderer-local @/types/acp) differs.

import type { AcpContent, AcpUpdate, UpdateRecord } from '@/types/acp'

// AcpUpdate's last member is a `{ sessionUpdate: string; [k: string]: unknown }`
// forward-compat catch-all. Its `sessionUpdate: string` is structurally
// compatible with every literal, which defeats `switch`/`===` narrowing on
// that field (TS keeps the catch-all in the narrowed union, so the specific
// fields read back as `unknown`). Extract<> works at the type level instead
// and correctly drops the catch-all, since `string` isn't assignable to a
// literal — so narrow with these named aliases after an `===` check.
type ChunkUpdate = Extract<
  AcpUpdate,
  { sessionUpdate: 'agent_message_chunk' | 'agent_thought_chunk' | 'user_message_chunk' }
>
type ToolCallUpdate = Extract<AcpUpdate, { sessionUpdate: 'tool_call' }>
type ToolCallUpdateUpdate = Extract<AcpUpdate, { sessionUpdate: 'tool_call_update' }>
type PlanUpdate = Extract<AcpUpdate, { sessionUpdate: 'plan' }>

export type BubbleRole = 'agent' | 'thought' | 'user'

export interface BubbleItem {
  kind: 'bubble'
  role: BubbleRole
  text: string
  key: string
}

export interface PlanEntry {
  content: string
  status?: string
  priority?: string
}

export interface PlanItem {
  kind: 'plan'
  entries: PlanEntry[]
  key: string
}

export interface ToolItem {
  kind: 'tool'
  toolCallId: string
  title?: string
  toolKind?: string
  status?: string
  locations?: { path: string; line?: number }[]
  key: string
}

export interface DebugItem {
  kind: 'debug'
  sessionUpdate: string
  key: string
}

export type ChatItem = BubbleItem | PlanItem | ToolItem | DebugItem

function extractText(content?: AcpContent): string {
  if (!content) return ''
  if (typeof content.text === 'string') return content.text
  return ''
}

/**
 * Turns a session's flat UpdateRecord stream into renderable chat items:
 * - agent_message_chunk / agent_thought_chunk / user_message_chunk runs are
 *   coalesced into one bubble each, until a non-chunk update breaks the run.
 * - plan updates are kept at the chronological point of their LATEST
 *   occurrence only; earlier plan cards are dropped.
 * - tool_call / tool_call_update share one card per toolCallId, positioned
 *   at the first tool_call/tool_call_update seen for that id, always
 *   showing the latest status/title/locations.
 * - anything else becomes a debug row.
 */
export function buildChatItems(records: UpdateRecord[]): ChatItem[] {
  const items: ChatItem[] = []
  let currentBubble: BubbleItem | null = null
  const toolIndex = new Map<string, number>()

  for (const rec of records) {
    const u = rec.update

    if (
      u.sessionUpdate === 'agent_message_chunk' ||
      u.sessionUpdate === 'agent_thought_chunk' ||
      u.sessionUpdate === 'user_message_chunk'
    ) {
      const role: BubbleRole =
        u.sessionUpdate === 'agent_message_chunk'
          ? 'agent'
          : u.sessionUpdate === 'agent_thought_chunk'
            ? 'thought'
            : 'user'
      const text = extractText((u as ChunkUpdate).content)
      if (currentBubble && currentBubble.role === role) {
        currentBubble.text += text
      } else {
        currentBubble = { kind: 'bubble', role, text, key: `bubble-${rec.seq}` }
        items.push(currentBubble)
      }
      continue
    }

    currentBubble = null

    if (u.sessionUpdate === 'plan') {
      const plan = u as PlanUpdate
      items.push({ kind: 'plan', entries: plan.entries ?? [], key: `plan-${rec.seq}` })
      continue
    }

    if (u.sessionUpdate === 'tool_call') {
      const tc = u as ToolCallUpdate
      const item: ToolItem = {
        kind: 'tool',
        toolCallId: tc.toolCallId,
        title: tc.title,
        toolKind: tc.kind,
        status: tc.status,
        locations: tc.locations,
        key: `tool-${tc.toolCallId}`,
      }
      const idx = toolIndex.get(tc.toolCallId)
      if (idx !== undefined) {
        items[idx] = item
      } else {
        toolIndex.set(tc.toolCallId, items.length)
        items.push(item)
      }
      continue
    }

    if (u.sessionUpdate === 'tool_call_update') {
      const tcu = u as ToolCallUpdateUpdate
      const idx = toolIndex.get(tcu.toolCallId)
      if (idx !== undefined) {
        const prev = items[idx] as ToolItem
        items[idx] = {
          ...prev,
          status: tcu.status ?? prev.status,
          title: tcu.title ?? prev.title,
          locations: tcu.locations ?? prev.locations,
        }
      } else {
        const item: ToolItem = {
          kind: 'tool',
          toolCallId: tcu.toolCallId,
          title: tcu.title,
          status: tcu.status,
          locations: tcu.locations,
          key: `tool-${tcu.toolCallId}`,
        }
        toolIndex.set(tcu.toolCallId, items.length)
        items.push(item)
      }
      continue
    }

    items.push({ kind: 'debug', sessionUpdate: u.sessionUpdate, key: `debug-${rec.seq}` })
  }

  // Keep only the latest plan card, at the position it last occurred.
  let lastPlanIdx = -1
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'plan') lastPlanIdx = i
  }
  return items.filter((it, i) => it.kind !== 'plan' || i === lastPlanIdx)
}

/** Maps session status to a status-dot color token. Used by the session strip. */
export function statusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'var(--accent)'
    case 'awaiting-permission':
      return 'var(--amber)'
    case 'error':
    case 'exited':
      return 'var(--red)'
    default:
      return 'var(--text-muted)'
  }
}
