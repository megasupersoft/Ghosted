import { describe, expect, it } from 'vitest'
import {
  applyOps,
  backoffMs,
  buildMutation,
  parseFields,
  parseItem,
  type PmFields,
  type PmItem,
  type PmOp,
} from './pmShared'

const baseItem = (id: string, over: Partial<PmItem> = {}): PmItem => ({
  itemId: id,
  contentId: `c-${id}`,
  contentType: 'Issue',
  number: 1,
  title: `Item ${id}`,
  url: null,
  state: 'OPEN',
  repo: 'o/r',
  assignees: [],
  labels: [],
  status: 'Backlog',
  statusOptionId: 'opt-backlog',
  priority: null,
  priorityOptionId: null,
  startDate: null,
  targetDate: null,
  effort: null,
  iterationId: null,
  iterationTitle: null,
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
})

const fields: PmFields = {
  statusFieldId: 'F-status',
  statusOptions: [
    { id: 'opt-backlog', name: 'Backlog' },
    { id: 'opt-done', name: 'Done' },
  ],
  priorityFieldId: 'F-priority',
  priorityOptions: [{ id: 'opt-p1', name: 'P1' }],
  startFieldId: 'F-start',
  targetFieldId: 'F-target',
  effortFieldId: null,
  iterationFieldId: null,
  iterations: [],
}

describe('applyOps (rebase local ops onto server truth)', () => {
  it('applies status and date ops per-field', () => {
    const server = [baseItem('a'), baseItem('b')]
    const ops: PmOp[] = [
      {
        opId: '1',
        kind: 'setStatus',
        itemId: 'a',
        optionId: 'opt-done',
        display: 'Done',
        prevOptionId: 'opt-backlog',
        prevDisplay: 'Backlog',
        attempts: 0,
      },
      { opId: '2', kind: 'setDate', itemId: 'b', field: 'target', date: '2026-08-01', prevDate: null, attempts: 0 },
    ]
    const out = applyOps(server, ops)
    expect(out.find((i) => i.itemId === 'a')?.status).toBe('Done')
    expect(out.find((i) => i.itemId === 'a')?.statusOptionId).toBe('opt-done')
    expect(out.find((i) => i.itemId === 'b')?.targetDate).toBe('2026-08-01')
    // server array untouched
    expect(server[0].status).toBe('Backlog')
  })

  it('reorders relative to afterItemId and to top for null', () => {
    const server = [baseItem('a'), baseItem('b'), baseItem('c')]
    const toTop = applyOps(server, [{ opId: '1', kind: 'reorder', itemId: 'c', afterItemId: null, attempts: 0 }])
    expect(toTop.map((i) => i.itemId)).toEqual(['c', 'a', 'b'])
    const afterB = applyOps(server, [{ opId: '2', kind: 'reorder', itemId: 'a', afterItemId: 'b', attempts: 0 }])
    expect(afterB.map((i) => i.itemId)).toEqual(['b', 'a', 'c'])
  })

  it('materializes create ops as temp items exactly once', () => {
    const op: PmOp = {
      opId: '1',
      kind: 'create',
      itemId: 'temp-1',
      title: 'New thing',
      statusOptionId: 'opt-backlog',
      statusDisplay: 'Backlog',
      attempts: 0,
    }
    const out = applyOps([baseItem('a')], [op, op])
    expect(out.filter((i) => i.itemId === 'temp-1')).toHaveLength(1)
    expect(out.find((i) => i.itemId === 'temp-1')?.status).toBe('Backlog')
  })

  it('ignores ops for items the server no longer has', () => {
    const out = applyOps(
      [baseItem('a')],
      [
        {
          opId: '1',
          kind: 'setStatus',
          itemId: 'ghost',
          optionId: 'opt-done',
          display: 'Done',
          prevOptionId: null,
          prevDisplay: null,
          attempts: 0,
        },
      ],
    )
    expect(out).toHaveLength(1)
    expect(out[0].itemId).toBe('a')
  })
})

describe('backoffMs', () => {
  it('doubles and caps at 30s', () => {
    expect(backoffMs(0)).toBe(1000)
    expect(backoffMs(1)).toBe(2000)
    expect(backoffMs(4)).toBe(16000)
    expect(backoffMs(10)).toBe(30000)
  })
})

describe('buildMutation', () => {
  it('builds single-select update for setStatus', () => {
    const doc = buildMutation(
      {
        opId: '1',
        kind: 'setStatus',
        itemId: 'i1',
        optionId: 'opt-done',
        display: 'Done',
        prevOptionId: null,
        prevDisplay: null,
        attempts: 0,
      },
      'P1',
      fields,
    )
    expect(doc?.query).toContain('updateProjectV2ItemFieldValue')
    expect(doc?.variables).toMatchObject({ projectId: 'P1', itemId: 'i1', fieldId: 'F-status', optionId: 'opt-done' })
  })

  it('builds clear mutation for null values', () => {
    const doc = buildMutation(
      { opId: '1', kind: 'setDate', itemId: 'i1', field: 'start', date: null, prevDate: '2026-01-01', attempts: 0 },
      'P1',
      fields,
    )
    expect(doc?.query).toContain('clearProjectV2ItemFieldValue')
    expect(doc?.variables).toMatchObject({ fieldId: 'F-start' })
  })

  it('builds position update for reorder (top vs after)', () => {
    const top = buildMutation({ opId: '1', kind: 'reorder', itemId: 'i1', afterItemId: null, attempts: 0 }, 'P1', fields)
    expect(top?.query).toContain('updateProjectV2ItemPosition')
    expect(top?.variables).not.toHaveProperty('afterId')
    const after = buildMutation({ opId: '2', kind: 'reorder', itemId: 'i1', afterItemId: 'i9', attempts: 0 }, 'P1', fields)
    expect(after?.variables).toMatchObject({ afterId: 'i9' })
  })

  it('returns null for create (multi-step flow) and missing fields', () => {
    expect(
      buildMutation(
        { opId: '1', kind: 'create', itemId: 't', title: 'x', statusOptionId: null, statusDisplay: null, attempts: 0 },
        'P1',
        fields,
      ),
    ).toBeNull()
    expect(
      buildMutation(
        { opId: '2', kind: 'setDate', itemId: 'i', field: 'start', date: '2026-01-01', prevDate: null, attempts: 0 },
        'P1',
        { ...fields, startFieldId: null },
      ),
    ).toBeNull()
  })
})

describe('parseFields', () => {
  it('maps the GA default fields by name', () => {
    const parsed = parseFields([
      { id: 'f1', name: 'Status', dataType: 'SINGLE_SELECT', options: [{ id: 'o1', name: 'Todo' }] },
      { id: 'f2', name: 'Priority', dataType: 'SINGLE_SELECT', options: [{ id: 'p1', name: 'P1' }] },
      { id: 'f3', name: 'Start date', dataType: 'DATE' },
      { id: 'f4', name: 'Target date', dataType: 'DATE' },
      { id: 'f5', name: 'Effort', dataType: 'NUMBER' },
      {
        id: 'f6',
        name: 'Sprint',
        dataType: 'ITERATION',
        configuration: { iterations: [{ id: 'it1', title: 'Sprint 1', startDate: '2026-07-01', duration: 14 }] },
      },
      { id: 'f7', name: 'Title', dataType: 'TITLE' },
    ])
    expect(parsed.statusFieldId).toBe('f1')
    expect(parsed.statusOptions).toEqual([{ id: 'o1', name: 'Todo' }])
    expect(parsed.priorityFieldId).toBe('f2')
    expect(parsed.startFieldId).toBe('f3')
    expect(parsed.targetFieldId).toBe('f4')
    expect(parsed.effortFieldId).toBe('f5')
    expect(parsed.iterationFieldId).toBe('f6')
    expect(parsed.iterations[0]).toMatchObject({ title: 'Sprint 1' })
  })
})

describe('parseItem', () => {
  it('parses an issue item with field values', () => {
    const item = parseItem({
      id: 'I1',
      updatedAt: '2026-07-01T00:00:00Z',
      type: 'ISSUE',
      content: {
        id: 'C1',
        number: 42,
        title: 'Fix the thing',
        url: 'https://github.com/o/r/issues/42',
        state: 'OPEN',
        repository: { nameWithOwner: 'o/r' },
        assignees: { nodes: [{ login: 'danger' }] },
        labels: { nodes: [{ name: 'bug', color: 'ff0000' }] },
      },
      fieldValues: {
        nodes: [
          { name: 'In Progress', optionId: 'opt-ip', field: { name: 'Status' } },
          { name: 'P1', optionId: 'opt-p1', field: { name: 'Priority' } },
          { date: '2026-07-10', field: { name: 'Start date' } },
          { date: '2026-07-20', field: { name: 'Target date' } },
          { number: 3, field: { name: 'Effort' } },
        ],
      },
    })
    expect(item).toMatchObject({
      itemId: 'I1',
      number: 42,
      title: 'Fix the thing',
      repo: 'o/r',
      assignees: ['danger'],
      status: 'In Progress',
      statusOptionId: 'opt-ip',
      priority: 'P1',
      startDate: '2026-07-10',
      targetDate: '2026-07-20',
      effort: 3,
    })
  })

  it('handles drafts and missing content', () => {
    const draft = parseItem({ id: 'I2', type: 'DRAFT_ISSUE', content: { id: 'D1', title: 'Draft' } })
    expect(draft).toMatchObject({ contentType: 'DraftIssue', title: 'Draft', status: null })
    expect(parseItem(null)).toBeNull()
  })
})
