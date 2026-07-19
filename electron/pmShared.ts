/**
 * Shared, side-effect-free core of the GitHub Projects sync engine.
 * Used by the main-process sync service and imported (types + pure helpers)
 * by the renderer. Everything here is unit-testable without Electron.
 *
 * Design (per 2026 research): local store is the source of truth; GitHub is a
 * sync target. Mutations apply locally first as ops in a persistent FIFO
 * queue; the server snapshot is reconciled per-field, with pending local ops
 * rebased on top (the Linear "transaction queue" shape, minus the infra).
 */

export interface PmFieldOption {
  id: string
  name: string
}

export interface PmIteration {
  id: string
  title: string
  startDate: string
  duration: number
}

export interface PmFields {
  statusFieldId: string | null
  statusOptions: PmFieldOption[]
  priorityFieldId: string | null
  priorityOptions: PmFieldOption[]
  startFieldId: string | null
  targetFieldId: string | null
  effortFieldId: string | null
  iterationFieldId: string | null
  iterations: PmIteration[]
}

export interface PmItem {
  itemId: string
  contentId: string | null
  contentType: 'Issue' | 'PullRequest' | 'DraftIssue'
  number: number | null
  title: string
  url: string | null
  state: string | null
  repo: string | null
  assignees: string[]
  labels: { name: string; color: string }[]
  status: string | null
  statusOptionId: string | null
  priority: string | null
  priorityOptionId: string | null
  startDate: string | null
  targetDate: string | null
  effort: number | null
  iterationId: string | null
  iterationTitle: string | null
  updatedAt: string
}

export type PmOp =
  | {
      opId: string
      kind: 'setStatus'
      itemId: string
      optionId: string | null
      display: string | null
      prevOptionId: string | null
      prevDisplay: string | null
      attempts: number
    }
  | {
      opId: string
      kind: 'setPriority'
      itemId: string
      optionId: string | null
      display: string | null
      prevOptionId: string | null
      prevDisplay: string | null
      attempts: number
    }
  | {
      opId: string
      kind: 'setDate'
      itemId: string
      field: 'start' | 'target'
      date: string | null
      prevDate: string | null
      attempts: number
    }
  | {
      opId: string
      kind: 'reorder'
      itemId: string
      afterItemId: string | null
      attempts: number
    }
  | {
      opId: string
      kind: 'create'
      itemId: string // temp-… placeholder until the server assigns ids
      title: string
      statusOptionId: string | null
      statusDisplay: string | null
      attempts: number
    }

export interface PmSnapshot {
  status: 'disconnected' | 'no-gh' | 'no-remote' | 'no-project' | 'connecting' | 'connected' | 'error'
  error: string | null
  repo: { owner: string; name: string } | null
  projects: { id: string; number: number; title: string }[]
  selectedProject: { id: string; number: number; title: string } | null
  fields: PmFields | null
  items: PmItem[]
  pendingOps: number
  failedOps: number
  lastSyncedAt: number | null
  rateLimit: { remaining: number; resetAt: string } | null
}

// ─── Pure: rebase local ops onto a server snapshot ───────────────────────────

export function applyOps(serverItems: PmItem[], ops: PmOp[]): PmItem[] {
  let items = serverItems.map((i) => ({ ...i }))
  for (const op of ops) {
    switch (op.kind) {
      case 'setStatus':
        items = items.map((i) =>
          i.itemId === op.itemId ? { ...i, status: op.display, statusOptionId: op.optionId } : i,
        )
        break
      case 'setPriority':
        items = items.map((i) =>
          i.itemId === op.itemId ? { ...i, priority: op.display, priorityOptionId: op.optionId } : i,
        )
        break
      case 'setDate':
        items = items.map((i) =>
          i.itemId === op.itemId
            ? op.field === 'start'
              ? { ...i, startDate: op.date }
              : { ...i, targetDate: op.date }
            : i,
        )
        break
      case 'reorder': {
        const idx = items.findIndex((i) => i.itemId === op.itemId)
        if (idx === -1) break
        const [moved] = items.splice(idx, 1)
        if (op.afterItemId === null) {
          items.unshift(moved)
        } else {
          const after = items.findIndex((i) => i.itemId === op.afterItemId)
          items.splice(after === -1 ? items.length : after + 1, 0, moved)
        }
        break
      }
      case 'create':
        if (!items.some((i) => i.itemId === op.itemId)) {
          items.push({
            itemId: op.itemId,
            contentId: null,
            contentType: 'DraftIssue',
            number: null,
            title: op.title,
            url: null,
            state: null,
            repo: null,
            assignees: [],
            labels: [],
            status: op.statusDisplay,
            statusOptionId: op.statusOptionId,
            priority: null,
            priorityOptionId: null,
            startDate: null,
            targetDate: null,
            effort: null,
            iterationId: null,
            iterationTitle: null,
            updatedAt: new Date(0).toISOString(),
          })
        }
        break
    }
  }
  return items
}

// ─── Pure: backoff schedule ──────────────────────────────────────────────────

export const MAX_OP_ATTEMPTS = 5

export function backoffMs(attempts: number): number {
  return Math.min(30_000, 1000 * 2 ** attempts)
}

// ─── Pure: GraphQL builders ──────────────────────────────────────────────────

export interface MutationDoc {
  query: string
  variables: Record<string, unknown>
}

/** Build the GraphQL mutation for an op. Returns null for ops that need the
 * multi-step create flow (handled by the service). */
export function buildMutation(op: PmOp, projectId: string, fields: PmFields): MutationDoc | null {
  switch (op.kind) {
    case 'setStatus':
    case 'setPriority': {
      const fieldId = op.kind === 'setStatus' ? fields.statusFieldId : fields.priorityFieldId
      if (!fieldId) return null
      if (op.optionId === null) {
        return {
          query:
            'mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!){ clearProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId}){ projectV2Item { id } } }',
          variables: { projectId, itemId: op.itemId, fieldId },
        }
      }
      return {
        query:
          'mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!){ updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}){ projectV2Item { id } } }',
        variables: { projectId, itemId: op.itemId, fieldId, optionId: op.optionId },
      }
    }
    case 'setDate': {
      const fieldId = op.field === 'start' ? fields.startFieldId : fields.targetFieldId
      if (!fieldId) return null
      if (op.date === null) {
        return {
          query:
            'mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!){ clearProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId}){ projectV2Item { id } } }',
          variables: { projectId, itemId: op.itemId, fieldId },
        }
      }
      return {
        query:
          'mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$date:Date!){ updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{date:$date}}){ projectV2Item { id } } }',
        variables: { projectId, itemId: op.itemId, fieldId, date: op.date },
      }
    }
    case 'reorder':
      return {
        query: op.afterItemId
          ? 'mutation($projectId:ID!,$itemId:ID!,$afterId:ID!){ updateProjectV2ItemPosition(input:{projectId:$projectId,itemId:$itemId,afterId:$afterId}){ items(first:1){ totalCount } } }'
          : 'mutation($projectId:ID!,$itemId:ID!){ updateProjectV2ItemPosition(input:{projectId:$projectId,itemId:$itemId}){ items(first:1){ totalCount } } }',
        variables: op.afterItemId
          ? { projectId, itemId: op.itemId, afterId: op.afterItemId }
          : { projectId, itemId: op.itemId },
      }
    case 'create':
      return null
  }
}

// ─── Pure: GraphQL response parsers ──────────────────────────────────────────

const FIELD_NAMES = {
  status: 'status',
  priority: 'priority',
  start: 'start date',
  target: 'target date',
  effort: 'effort',
}

export function parseFields(nodes: any[]): PmFields {
  const fields: PmFields = {
    statusFieldId: null,
    statusOptions: [],
    priorityFieldId: null,
    priorityOptions: [],
    startFieldId: null,
    targetFieldId: null,
    effortFieldId: null,
    iterationFieldId: null,
    iterations: [],
  }
  for (const f of nodes ?? []) {
    const name = String(f?.name ?? '').toLowerCase()
    if (name === FIELD_NAMES.status && f.options) {
      fields.statusFieldId = f.id
      fields.statusOptions = f.options.map((o: any) => ({ id: o.id, name: o.name }))
    } else if (name === FIELD_NAMES.priority && f.options) {
      fields.priorityFieldId = f.id
      fields.priorityOptions = f.options.map((o: any) => ({ id: o.id, name: o.name }))
    } else if (name === FIELD_NAMES.start && f.dataType === 'DATE') {
      fields.startFieldId = f.id
    } else if (name === FIELD_NAMES.target && f.dataType === 'DATE') {
      fields.targetFieldId = f.id
    } else if (name === FIELD_NAMES.effort) {
      fields.effortFieldId = f.id
    } else if (f?.configuration?.iterations) {
      fields.iterationFieldId = f.id
      fields.iterations = f.configuration.iterations.map((it: any) => ({
        id: it.id,
        title: it.title,
        startDate: it.startDate,
        duration: it.duration,
      }))
    }
  }
  return fields
}

export function parseItem(node: any): PmItem | null {
  if (!node?.id) return null
  const content = node.content ?? {}
  const item: PmItem = {
    itemId: node.id,
    contentId: content.id ?? null,
    contentType: node.type === 'PULL_REQUEST' ? 'PullRequest' : node.type === 'DRAFT_ISSUE' ? 'DraftIssue' : 'Issue',
    number: content.number ?? null,
    title: content.title ?? '(untitled)',
    url: content.url ?? null,
    state: content.state ?? null,
    repo: content.repository?.nameWithOwner ?? null,
    assignees: (content.assignees?.nodes ?? []).map((a: any) => a.login),
    labels: (content.labels?.nodes ?? []).map((l: any) => ({ name: l.name, color: l.color })),
    status: null,
    statusOptionId: null,
    priority: null,
    priorityOptionId: null,
    startDate: null,
    targetDate: null,
    effort: null,
    iterationId: null,
    iterationTitle: null,
    updatedAt: node.updatedAt ?? new Date(0).toISOString(),
  }
  for (const fv of node.fieldValues?.nodes ?? []) {
    const fieldName = String(fv?.field?.name ?? '').toLowerCase()
    if (fv.optionId !== undefined && fieldName === FIELD_NAMES.status) {
      item.status = fv.name ?? null
      item.statusOptionId = fv.optionId ?? null
    } else if (fv.optionId !== undefined && fieldName === FIELD_NAMES.priority) {
      item.priority = fv.name ?? null
      item.priorityOptionId = fv.optionId ?? null
    } else if (fv.date !== undefined && fieldName === FIELD_NAMES.start) {
      item.startDate = fv.date
    } else if (fv.date !== undefined && fieldName === FIELD_NAMES.target) {
      item.targetDate = fv.date
    } else if (fv.number !== undefined && fieldName === FIELD_NAMES.effort) {
      item.effort = fv.number
    } else if (fv.iterationId !== undefined) {
      item.iterationId = fv.iterationId
      item.iterationTitle = fv.title ?? null
    }
  }
  return item
}
