// Derives the per-session activity readout shown under each row in the
// sessions strip. Updates are RAW ACP session/update payloads (see
// src/types/acp.ts) — token usage is not spec-stable, so extraction is
// best-effort: the spec'd `usage_update` (context tokens in `used`), a
// `Usage`-shaped object (`totalTokens` / input+output) on the update itself,
// or one tucked under `_meta` by the agent. ACP usage totals are cumulative
// across the session, so the latest value seen wins — never summed.

import type { UpdateRecord } from '@/types/acp'

/** Raw update view: the wire payload with agent-specific extra keys intact. */
type RawUpdate = { sessionUpdate: string } & Record<string, unknown>

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Reads a token total out of a `Usage`-shaped object (camel or snake case). */
function tokensFromUsage(v: unknown): number | null {
  if (!isRecord(v)) return null
  const total = v.totalTokens ?? v.total_tokens
  if (typeof total === 'number') return total
  const input = v.inputTokens ?? v.input_tokens
  const output = v.outputTokens ?? v.output_tokens
  if (typeof input === 'number' || typeof output === 'number') {
    return (typeof input === 'number' ? input : 0) + (typeof output === 'number' ? output : 0)
  }
  return null
}

/** Pulls a cumulative token count out of one raw update, if it carries one. */
function tokensFromUpdate(u: RawUpdate): number | null {
  if (u.sessionUpdate === 'usage_update' && typeof u.used === 'number') return u.used
  const direct = tokensFromUsage(u.usage) ?? tokensFromUsage(u._meta)
  if (direct !== null) return direct
  // Agents namespace their _meta keys — check one level of nesting.
  if (isRecord(u._meta)) {
    for (const v of Object.values(u._meta)) {
      const n = tokensFromUsage(v)
      if (n !== null) return n
    }
  }
  return null
}

function formatTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

/**
 * Builds sessionId → readout labels from the flat update stream: token total
 * when any of the session's updates carried usage, otherwise
 * "<n> updates · <m> tools" (tools counted as distinct toolCallIds, matching
 * the one-card-per-id chat view).
 */
export function buildActivityLabels(records: UpdateRecord[]): Map<string, string> {
  const bySession = new Map<string, { tokens: number | null; updates: number; tools: Set<string> }>()
  for (const rec of records) {
    let acc = bySession.get(rec.sessionId)
    if (!acc) {
      acc = { tokens: null, updates: 0, tools: new Set() }
      bySession.set(rec.sessionId, acc)
    }
    acc.updates++
    const u = rec.update as RawUpdate
    if (u.sessionUpdate === 'tool_call' && typeof u.toolCallId === 'string') {
      acc.tools.add(u.toolCallId)
    }
    const tokens = tokensFromUpdate(u)
    if (tokens !== null) acc.tokens = tokens
  }
  const labels = new Map<string, string>()
  for (const [id, acc] of bySession) {
    labels.set(
      id,
      acc.tokens !== null
        ? `${formatTokens(acc.tokens)} tokens`
        : `${acc.updates} updates · ${acc.tools.size} tools`,
    )
  }
  return labels
}
