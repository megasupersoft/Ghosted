import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '@/store'
import { RefreshCw, Ghost } from 'lucide-react'

interface KanbanItem {
  id: string; title: string; number?: number
  labels?: string[]; assignee?: string; url?: string
}
interface KanbanColumn { id: string; name: string; items: KanbanItem[] }

function Card({ item, isDragging }: { item: KanbanItem; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSorting } = useSortable({ id: item.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isSorting ? 0.4 : 1 }} {...attributes} {...listeners}>
      <div style={{
        background: isDragging ? 'var(--bg-hover)' : 'var(--bg-elevated)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 10px', cursor: 'grab', marginBottom: 6, userSelect: 'none',
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.5)' : undefined,
      }}>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 5 }}>
          {item.url ? (
            <span style={{ cursor: 'pointer' }} onClick={() => window.electron.shell.openExternal(item.url!)}>
              {item.title}
            </span>
          ) : item.title}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {item.number != null && <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>#{item.number}</span>}
          {item.labels?.map(l => (
            <span key={l} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'var(--accent-dim)', color: 'var(--accent-bright)' }}>{l}</span>
          ))}
          {item.assignee && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>@{item.assignee}</span>}
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
    <div style={{ width: 258, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{col.name}</span>
        <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{col.items.length}</span>
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
              placeholder="Card title..."
              style={{ width: '100%', resize: 'none', height: 60, fontSize: 13, padding: 8, borderRadius: 6, background: 'var(--bg-elevated)', border: 'none', color: 'var(--text-primary)', outline: 'none', marginBottom: 4 }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={submit} style={{ flex: 1, padding: '4px 0', borderRadius: 4, background: 'var(--accent)', color: '#fff', fontSize: 13 }}>Add</button>
              <button onClick={() => setAdding(false)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 13, color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}>x</button>
            </div>
          </>
        ) : (
          <button onClick={() => setAdding(true)} style={{ width: '100%', padding: '5px 0', borderRadius: 4, fontSize: 13, color: 'var(--text-muted)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
          >+ Add card</button>
        )}
      </div>
    </div>
  )
}

// Parse gh project items JSON into columns
function parseProjectItems(json: string): KanbanColumn[] {
  try {
    const data = JSON.parse(json)
    const items = data.items || data
    const colMap = new Map<string, KanbanItem[]>()

    for (const item of items) {
      const status = item.status ?? item.Status ?? 'Backlog'
      const title = item.title ?? item.Title ?? 'Untitled'
      const number = item.number ?? item['issue number'] ?? item['pr number']
      const labels = item.labels ? item.labels.split(', ').filter(Boolean) : []
      const assignees = item.assignees ?? item.Assignees ?? ''
      const url = item.url ?? item.URL ?? ''

      if (!colMap.has(status)) colMap.set(status, [])
      colMap.get(status)!.push({
        id: `${item.id ?? Date.now()}-${Math.random()}`,
        title,
        number: number ? Number(number) : undefined,
        labels: labels.length > 0 ? labels : undefined,
        assignee: assignees.split(',')[0]?.trim() || undefined,
        url: url || undefined,
      })
    }

    return Array.from(colMap.entries()).map(([name, items]) => ({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      items,
    }))
  } catch { return [] }
}

export default function KanbanPane({ leafId }: { leafId?: string }) {
  const { workspacePath, addStatus } = useStore()
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [active, setActive] = useState<KanbanItem | null>(null)
  const [remote, setRemote] = useState<{ owner: string; repo: string } | null>(null)
  const [projectName, setProjectName] = useState('')
  const [projectNumber, setProjectNumber] = useState<number | null>(null)
  const [projectId, setProjectId] = useState('')
  const [statusFieldId, setStatusFieldId] = useState('')
  const [statusOptionIds, setStatusOptionIds] = useState<Map<string, string>>(new Map())
  const [status, setStatus] = useState<'idle' | 'loading' | 'connected' | 'no-gh' | 'no-project' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Detect remote
  useEffect(() => {
    if (!workspacePath) { setRemote(null); return }
    window.electron.git.remote(workspacePath).then(r => setRemote(r))
  }, [workspacePath])

  const fetchingRef = useRef(false)
  const fetchProject = useCallback(async () => {
    if (!workspacePath || !remote || fetchingRef.current) return
    fetchingRef.current = true
    setStatus('loading')
    try {

    // First check if gh CLI is available and authenticated
    const authCheck = await window.electron.git.gh(workspacePath, 'auth status')
    if (!authCheck.ok) {
      setStatus('no-gh')
      setErrorMsg('gh CLI not authenticated. Run `gh auth login` in terminal.')
      return
    }

    // Use GraphQL via gh api — works for both users and orgs
    // Try org first, fall back to user
    const gqlProjects = `
      query($login:String!) {
        organization(login:$login) { projectsV2(first:10) { nodes { id number title } } }
      }
    `
    const gqlProjectsUser = `
      query($login:String!) {
        user(login:$login) { projectsV2(first:10) { nodes { id number title } } }
      }
    `
    let projects: any[] = []
    let apiError = ''
    const orgResult = await window.electron.git.gh(workspacePath,
      `api graphql -f query='${gqlProjects.replace(/\n/g, ' ')}' -f login='${remote.owner}'`)
    if (orgResult.ok) {
      try {
        const d = JSON.parse(orgResult.data!)
        if (d.errors?.[0]?.type === 'RATE_LIMIT') apiError = 'GitHub API rate limit exceeded. Try again later.'
        projects = d.data?.organization?.projectsV2?.nodes ?? []
      } catch {}
    } else {
      if (orgResult.error?.includes('read:project') || orgResult.error?.includes('required scopes')) {
        setStatus('error')
        setErrorMsg('scope:project')
        return
      }
      if (orgResult.error?.includes('rate limit')) apiError = 'GitHub API rate limit exceeded. Try again later.'
    }
    if (projects.length === 0 && !apiError) {
      const userResult = await window.electron.git.gh(workspacePath,
        `api graphql -f query='${gqlProjectsUser.replace(/\n/g, ' ')}' -f login='${remote.owner}'`)
      if (userResult.ok) {
        try {
          const d = JSON.parse(userResult.data!)
          if (d.errors?.[0]?.type === 'RATE_LIMIT') apiError = 'GitHub API rate limit exceeded. Try again later.'
          projects = d.data?.user?.projectsV2?.nodes ?? []
        } catch {}
      } else if (userResult.error?.includes('rate limit')) {
        apiError = 'GitHub API rate limit exceeded. Try again later.'
      }
    }

    if (apiError) {
      setStatus('error')
      setErrorMsg(apiError)
      return
    }

    if (projects.length === 0) {
      setStatus('no-project')
      return
    }

    // Match project by repo name, otherwise first
    const repoName = remote.repo.toLowerCase()
    const project = projects.find((p: any) => p.title?.toLowerCase() === repoName) ?? projects[0]
    setProjectId(project.id)

    // Fetch fields + items in one GraphQL call
    const gqlDetails = `
      query($id:ID!) {
        node(id:$id) {
          ... on ProjectV2 {
            fields(first:30) { nodes {
              ... on ProjectV2SingleSelectField { id name options { id name } }
            } }
            items(first:100) { nodes {
              id
              fieldValues(first:10) { nodes {
                ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }
              } }
              content {
                ... on Issue { title number url labels(first:5) { nodes { name } } assignees(first:1) { nodes { login } } }
                ... on PullRequest { title number url labels(first:5) { nodes { name } } assignees(first:1) { nodes { login } } }
                ... on DraftIssue { title }
              }
            } }
          }
        }
      }
    `
    const detailsResult = await window.electron.git.gh(workspacePath,
      `api graphql -f query='${gqlDetails.replace(/\n/g, ' ')}' -f id='${project.id}'`)
    if (!detailsResult.ok) {
      setStatus('error')
      setErrorMsg(detailsResult.error ?? 'Failed to fetch project details')
      return
    }

    let statusOptions: string[] = []
    let items: any[] = []
    try {
      const d = JSON.parse(detailsResult.data!)
      const proj = d.data?.node
      // Parse Status field
      const sf = proj?.fields?.nodes?.find((f: any) => f.name === 'Status' && f.options)
      if (sf) {
        statusOptions = sf.options.map((o: any) => o.name)
        setStatusFieldId(sf.id)
        const optMap = new Map<string, string>()
        for (const o of sf.options) optMap.set(o.name, o.id)
        setStatusOptionIds(optMap)
      }
      items = proj?.items?.nodes ?? []
    } catch {}
    if (statusOptions.length === 0) statusOptions = ['Todo', 'In Progress', 'Done']

    // Parse items into columns
    const colMap = new Map<string, KanbanItem[]>()
    for (const item of items) {
      const statusVal = item.fieldValues?.nodes?.find((f: any) => f.field?.name === 'Status')?.name ?? 'Backlog'
      const c = item.content
      if (!c || !c.title) continue
      if (!colMap.has(statusVal)) colMap.set(statusVal, [])
      colMap.get(statusVal)!.push({
        id: item.id,
        title: c.title,
        number: c.number,
        url: c.url,
        labels: c.labels?.nodes?.map((l: any) => l.name),
        assignee: c.assignees?.nodes?.[0]?.login,
      })
    }
    const itemCols = Array.from(colMap.entries()).map(([name, items]) => ({
      id: name.toLowerCase().replace(/\s+/g, '-'), name, items,
    }))

    // Build columns from Status field options, merging in any items
    const itemMap = new Map(itemCols.map(c => [c.name, c.items]))
    const cols: KanbanColumn[] = statusOptions.map(name => ({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      items: itemMap.get(name) ?? [],
    }))
    // Add any columns from items that aren't in the Status options (e.g. Backlog)
    for (const ic of itemCols) {
      if (!statusOptions.includes(ic.name)) cols.push(ic)
    }
    setColumns(cols)
    setProjectName(project.title)
    setProjectNumber(projectNumber)
    setStatus('connected')
    useStore.getState().addStatus('info', `Synced project "${project.title}" from ${remote.owner}/${remote.repo}`)

    } finally { fetchingRef.current = false }
  }, [workspacePath, remote])

  // Auto-fetch when remote is detected
  useEffect(() => {
    if (remote) fetchProject()
  }, [remote, fetchProject])

  const onDragStart = (e: DragStartEvent) =>
    setActive(columns.flatMap(c => c.items).find(i => i.id === e.active.id) ?? null)

  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null)
    const { active: a, over } = e
    if (!over) return
    const src = columns.find(c => c.items.some(i => i.id === a.id))
    const dst = columns.find(c => c.items.some(i => i.id === over.id) || c.id === over.id)
    if (!src || !dst || src.id === dst.id) return
    const item = src.items.find(i => i.id === a.id)!

    // Update local state immediately
    setColumns(cols => cols.map(c => {
      if (c.id === src.id) return { ...c, items: c.items.filter(i => i.id !== a.id) }
      if (c.id === dst.id) return { ...c, items: [...c.items, item] }
      return c
    }))

    // Sync status change to GitHub via GraphQL
    if (workspacePath && projectId && statusFieldId && !item.id.startsWith('temp-') && !item.id.startsWith('local-')) {
      const optionId = statusOptionIds.get(dst.name)
      if (optionId) {
        const mutation = `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!) { updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}) { projectV2Item { id } } }`
        const result = await window.electron.git.gh(
          workspacePath,
          `api graphql -f query='${mutation}' -f projectId='${projectId}' -f itemId='${item.id}' -f fieldId='${statusFieldId}' -f optionId='${optionId}'`
        )
        if (result.ok) {
          addStatus('info', `Moved "${item.title}" to ${dst.name}`)
        } else {
          addStatus('error', `Failed to move "${item.title}": ${result.error}`)
          fetchProject()
        }
      }
    }
  }

  const addCard = async (colId: string, title: string) => {
    if (!workspacePath || !remote || !projectNumber) {
      // Fallback to local-only if not connected
      setColumns(cols => cols.map(c => c.id === colId ? { ...c, items: [...c.items, { id: `local-${Date.now()}`, title }] } : c))
      return
    }

    // Add local card immediately for responsiveness
    const tempId = `temp-${Date.now()}`
    setColumns(cols => cols.map(c => c.id === colId ? { ...c, items: [...c.items, { id: tempId, title }] } : c))

    // Create issue via gh CLI
    const safeTitle = title.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$')
    const createResult = await window.electron.git.gh(
      workspacePath,
      `issue create --repo ${remote.owner}/${remote.repo} --title "${safeTitle}" --body ""`
    )

    if (createResult.ok && createResult.data) {
      const match = createResult.data.match(/\/issues\/(\d+)/)
      const issueNumber = match ? Number(match[1]) : null

      if (issueNumber && projectId) {
        // Get the issue's node ID via GraphQL
        const issueQuery = `query($owner:String!,$repo:String!,$num:Int!) { repository(owner:$owner,name:$repo) { issue(number:$num) { id } } }`
        const issueResult = await window.electron.git.gh(workspacePath,
          `api graphql -f query='${issueQuery}' -f owner='${remote.owner}' -f repo='${remote.repo}' -F num=${issueNumber}`)

        let contentId = ''
        try { contentId = JSON.parse(issueResult.data!).data.repository.issue.id } catch {}

        if (contentId) {
          // Add to project
          const addMutation = `mutation($projectId:ID!,$contentId:ID!) { addProjectV2ItemById(input:{projectId:$projectId,contentId:$contentId}) { item { id } } }`
          const addResult = await window.electron.git.gh(workspacePath,
            `api graphql -f query='${addMutation}' -f projectId='${projectId}' -f contentId='${contentId}'`)

          // Set status to the target column
          if (addResult.ok && statusFieldId) {
            const col = columns.find(c => c.id === colId)
            const optionId = col ? statusOptionIds.get(col.name) : null
            if (optionId) {
              try {
                const itemId = JSON.parse(addResult.data!).data.addProjectV2ItemById.item.id
                const setMutation = `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!) { updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}) { projectV2Item { id } } }`
                await window.electron.git.gh(workspacePath,
                  `api graphql -f query='${setMutation}' -f projectId='${projectId}' -f itemId='${itemId}' -f fieldId='${statusFieldId}' -f optionId='${optionId}'`)
              } catch {}
            }
          }
        }
        addStatus('info', `Created issue #${issueNumber}: ${title}`)
      }
      fetchProject()
    } else {
      addStatus('error', `Failed to create issue: ${createResult.error ?? 'unknown error'}`)
    }
  }

  // Empty states
  if (!workspacePath) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-ghost)' }}>
          <Ghost size={32} color="var(--accent)" style={{ opacity: 0.15, marginBottom: 8 }} />
          <div style={{ fontSize: 13 }}>Open a workspace to see its project board.</div>
        </div>
      </div>
    )
  }

  if (!remote) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-ghost)', fontSize: 13 }}>
          No GitHub remote detected.
        </div>
      </div>
    )
  }

  if (status === 'no-gh') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, maxWidth: 280, lineHeight: 1.6 }}>
          <div style={{ marginBottom: 8 }}>gh CLI not authenticated.</div>
          <div style={{ fontSize: 12, color: 'var(--text-ghost)' }}>
            Run <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>gh auth login</code> in the terminal to connect.
          </div>
        </div>
      </div>
    )
  }

  if (status === 'no-project') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-ghost)', fontSize: 13 }}>
          No GitHub Project found for {remote.owner}/{remote.repo}.
        </div>
      </div>
    )
  }

  if (status === 'error') {
    const isScopeError = errorMsg === 'scope:project'
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)' }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          {isScopeError ? (
            <>
              <div style={{ color: 'var(--amber)', fontSize: 13, marginBottom: 8 }}>Missing GitHub Project scope</div>
              <div style={{ color: 'var(--text-ghost)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
                Your token needs the <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>read:project</code> scope to access GitHub Projects.
              </div>
              <button
                onClick={() => window.electron.shell.openExternal('https://github.com/settings/tokens')}
                style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--accent)', color: '#fff', fontSize: 13, cursor: 'pointer' }}
              >
                Open Token Settings
              </button>
              <div style={{ color: 'var(--text-ghost)', fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
                Add <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>read:project</code> and <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>project</code> scopes to your token
              </div>
              <button onClick={fetchProject} style={{ marginTop: 10, padding: '4px 12px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                Retry
              </button>
            </>
          ) : (
            <>
              <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>Failed to sync</div>
              <div style={{ color: 'var(--text-ghost)', fontSize: 12 }}>{errorMsg}</div>
              <button onClick={fetchProject} style={{ marginTop: 12, padding: '4px 12px', borderRadius: 4, background: 'var(--accent)', color: '#fff', fontSize: 13 }}>
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}>
      <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {projectName || `${remote.owner}/${remote.repo}`}
        </span>
        {status === 'loading' && <RefreshCw size={12} color="var(--text-muted)" className="ghost-pulse" />}
        {status === 'connected' && <span style={{ color: 'var(--green)', fontSize: 11 }}>synced</span>}
        <span style={{ flex: 1 }} />
        <button onClick={fetchProject} title="Refresh" style={{ display: 'flex', color: 'var(--text-muted)' }}>
          <RefreshCw size={13} />
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {columns.map(col => <Column key={col.id} col={col} onAdd={addCard} />)}
          </div>
          <DragOverlay>{active && <Card item={active} isDragging />}</DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}
