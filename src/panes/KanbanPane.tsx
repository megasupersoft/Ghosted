import React, { useState } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '@/store'

interface KanbanItem {
  id: string; title: string; number?: number
  labels?: string[]; assignee?: string; url?: string
}
interface KanbanColumn { id: string; name: string; items: KanbanItem[] }

const DEMO: KanbanColumn[] = [
  { id: 'todo', name: 'To do', items: [
    { id: '1', title: 'Set up Electron main process', number: 1, labels: ['setup'] },
    { id: '2', title: 'Wire xterm.js to node-pty',   number: 2, labels: ['terminal'] },
    { id: '3', title: 'Add chokidar file watcher',   number: 3, labels: ['filetree'] },
  ]},
  { id: 'wip', name: 'In progress', items: [
    { id: '4', title: 'Knowledge graph (reagraph)',  number: 4, labels: ['graph'],  assignee: 'dirk' },
    { id: '5', title: 'Agent canvas (ReactFlow)',    number: 5, labels: ['canvas'], assignee: 'dirk' },
  ]},
  { id: 'done', name: 'Done', items: [
    { id: '6', title: 'Project scaffold',   number: 6, labels: ['infra'] },
    { id: '7', title: 'Zustand store',      number: 7, labels: ['infra'] },
  ]},
]

function Card({ item, isDragging }: { item: KanbanItem; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSorting } = useSortable({ id: item.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isSorting ? 0.4 : 1 }} {...attributes} {...listeners}>
      <div style={{
        background: isDragging ? 'var(--bg-hover)' : 'var(--bg-elevated)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
        padding: '8px 10px', cursor: 'grab', marginBottom: 6, userSelect: 'none',
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.5)' : undefined,
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 5 }}>{item.title}</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {item.number && <span style={{ color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>#{item.number}</span>}
          {item.labels?.map(l => (
            <span key={l} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 10, background: 'var(--accent-dim)', color: 'var(--accent-bright)' }}>{l}</span>
          ))}
          {item.assignee && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>@{item.assignee}</span>}
        </div>
      </div>
    </div>
  )
}

function Column({ col, onAdd }: { col: KanbanColumn; onAdd: (id: string, title: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const submit = () => { if (draft.trim()) { onAdd(col.id, draft.trim()); setDraft('') } setAdding(false) }

  return (
    <div style={{ width: 258, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{col.name}</span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{col.items.length}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 0' }}>
        <SortableContext items={col.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {col.items.map(item => <Card key={item.id} item={item} />)}
        </SortableContext>
      </div>
      <div style={{ padding: 8, flexShrink: 0 }}>
        {adding ? (
          <>
            <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } if (e.key === 'Escape') setAdding(false) }}
              placeholder="Card title…"
              style={{ width: '100%', resize: 'none', height: 60, fontSize: 12, padding: 8, borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--accent)', color: 'var(--text-primary)', outline: 'none', marginBottom: 4 }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={submit} style={{ flex: 1, padding: '4px 0', borderRadius: 4, background: 'var(--accent)', color: '#fff', fontSize: 12 }}>Add</button>
              <button onClick={() => setAdding(false)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>✕</button>
            </div>
          </>
        ) : (
          <button onClick={() => setAdding(true)} style={{ width: '100%', padding: '5px 0', borderRadius: 4, fontSize: 12, color: 'var(--text-muted)', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent-dim)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >+ Add card</button>
        )}
      </div>
    </div>
  )
}

export default function KanbanPane() {
  const { githubToken, setGithubToken } = useStore()
  const [columns, setColumns] = useState<KanbanColumn[]>(DEMO)
  const [active, setActive] = useState<KanbanItem | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [repoInput, setRepoInput] = useState('')
  const [ghStatus, setGhStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const onDragStart = (e: DragStartEvent) =>
    setActive(columns.flatMap(c => c.items).find(i => i.id === e.active.id) ?? null)

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null)
    const { active: a, over } = e
    if (!over) return
    const src = columns.find(c => c.items.some(i => i.id === a.id))
    const dst = columns.find(c => c.items.some(i => i.id === over.id) || c.id === over.id)
    if (!src || !dst || src.id === dst.id) return
    const item = src.items.find(i => i.id === a.id)!
    setColumns(cols => cols.map(c => {
      if (c.id === src.id) return { ...c, items: c.items.filter(i => i.id !== a.id) }
      if (c.id === dst.id) return { ...c, items: [...c.items, item] }
      return c
    }))
  }

  const addCard = (colId: string, title: string) =>
    setColumns(cols => cols.map(c => c.id === colId ? { ...c, items: [...c.items, { id: `local-${Date.now()}`, title }] } : c))

  const connectGitHub = async () => {
    if (!tokenInput.trim() || !repoInput.trim()) return
    setGhStatus('loading')
    try {
      const { graphql } = await import('@octokit/graphql')
      const [owner, repo] = repoInput.trim().split('/')
      const client = graphql.defaults({ headers: { authorization: `token ${tokenInput}` } })
      const data: any = await client(`query($owner:String!,$repo:String!){repository(owner:$owner,name:$repo){projectsV2(first:5){nodes{id title items(first:50){nodes{id fieldValues(first:10){nodes{...on ProjectV2ItemFieldSingleSelectValue{name field{...on ProjectV2SingleSelectField{name}}}}} content{...on Issue{title number url labels(first:5){nodes{name}}assignees(first:1){nodes{login}}}}}}}}}}`, { owner, repo })
      const project = data.repository.projectsV2.nodes[0]
      if (!project) { setGhStatus('error'); return }
      setGithubToken(tokenInput)
      const colMap = new Map<string, KanbanItem[]>()
      for (const node of project.items.nodes) {
        const status = node.fieldValues.nodes.find((f: any) => f.field?.name === 'Status')?.name ?? 'Backlog'
        const issue = node.content
        if (!issue) continue
        if (!colMap.has(status)) colMap.set(status, [])
        colMap.get(status)!.push({ id: node.id, title: issue.title, number: issue.number, url: issue.url, labels: issue.labels.nodes.map((l: any) => l.name), assignee: issue.assignees.nodes[0]?.login })
      }
      setColumns(Array.from(colMap.entries()).map(([name, items]) => ({ id: name.toLowerCase().replace(/\s+/g, '-'), name, items })))
      setGhStatus('idle')
    } catch { setGhStatus('error') }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <div style={{ padding: '0 12px', height: 44, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-surface)' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4 }}>Kanban</span>
        {!githubToken ? (
          <>
            <input placeholder="github token" type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)} style={{ width: 160, fontSize: 11 }} />
            <input placeholder="owner/repo" value={repoInput} onChange={e => setRepoInput(e.target.value)} style={{ width: 120, fontSize: 11 }} onKeyDown={e => e.key === 'Enter' && connectGitHub()} />
            <button onClick={connectGitHub} disabled={ghStatus === 'loading'} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, background: 'var(--accent)', color: '#fff', opacity: ghStatus === 'loading' ? 0.6 : 1 }}>
              {ghStatus === 'loading' ? '…' : 'Connect'}
            </button>
            {ghStatus === 'error' && <span style={{ color: 'var(--red)', fontSize: 11 }}>failed</span>}
          </>
        ) : (
          <>
            <span style={{ color: 'var(--green)', fontSize: 11 }} className="ghost-pulse">● GitHub connected</span>
            <button onClick={() => { setGithubToken(''); setColumns(DEMO) }} style={{ fontSize: 11, color: 'var(--text-muted)' }}>Disconnect</button>
          </>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {columns.map(col => <Column key={col.id} col={col} onAdd={addCard} />)}
            <button onClick={() => setColumns(c => [...c, { id: `col-${Date.now()}`, name: 'New column', items: [] }])}
              style={{ width: 220, padding: '8px 0', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>
              + Add column
            </button>
          </div>
          <DragOverlay>{active && <Card item={active} isDragging />}</DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}
