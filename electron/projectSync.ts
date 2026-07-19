/**
 * GitHub Projects v2 sync service (main process).
 *
 * Local snapshot is the source of truth for the renderer; GitHub is a sync
 * target. Writes go through a persistent FIFO op queue with exponential
 * backoff; reads use adaptive polling (fast while the PM pane is visible)
 * gated by a cheap change-probe query. Raw GraphQL over fetch — the gh CLI is
 * used only to obtain the auth token.
 */

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  applyOps,
  backoffMs,
  buildMutation,
  MAX_OP_ATTEMPTS,
  type PmFields,
  type PmItem,
  type PmOp,
  type PmSnapshot,
  parseFields,
  parseItem,
} from './pmShared'

const GQL_ENDPOINT = 'https://api.github.com/graphql'
const POLL_ACTIVE_MS = 30_000
const POLL_IDLE_MS = 5 * 60_000
const FULL_FETCH_EVERY = 5 // probes between unconditional full fetches

interface ServiceDeps {
  userDataDir: string
  getRepoRemote: (cwd: string) => { owner: string; name: string } | null
  onUpdate: (snapshot: PmSnapshot) => void
}

export class ProjectSyncService {
  private deps: ServiceDeps
  private token: string | null = null
  private repo: { owner: string; name: string } | null = null
  private repositoryId: string | null = null
  private projects: { id: string; number: number; title: string }[] = []
  private selected: { id: string; number: number; title: string } | null = null
  private fields: PmFields | null = null
  private serverItems: PmItem[] = []
  private ops: PmOp[] = []
  private status: PmSnapshot['status'] = 'disconnected'
  private error: string | null = null
  private lastSyncedAt: number | null = null
  private lastProjectUpdatedAt: string | null = null
  private lastTotalCount = -1
  private rateLimit: { remaining: number; resetAt: string } | null = null
  private failedOps = 0

  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private probesSinceFull = 0
  private visible = false
  private draining = false
  private destroyed = false

  constructor(deps: ServiceDeps) {
    this.deps = deps
    this.loadQueue()
  }

  // ─── Queue persistence ────────────────────────────────────────────────────

  private queueFile() {
    return path.join(this.deps.userDataDir, 'pm-ops.json')
  }

  private loadQueue() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.queueFile(), 'utf-8'))
      if (Array.isArray(raw)) this.ops = raw
    } catch {}
  }

  private persistQueue() {
    try {
      fs.writeFileSync(this.queueFile(), JSON.stringify(this.ops))
    } catch {}
  }

  // ─── Snapshot / notify ────────────────────────────────────────────────────

  snapshot(): PmSnapshot {
    return {
      status: this.status,
      error: this.error,
      repo: this.repo,
      projects: this.projects,
      selectedProject: this.selected,
      fields: this.fields,
      items: applyOps(this.serverItems, this.ops),
      pendingOps: this.ops.length,
      pendingItemIds: [...new Set(this.ops.map((o) => o.itemId))],
      failedOps: this.failedOps,
      lastSyncedAt: this.lastSyncedAt,
      rateLimit: this.rateLimit,
    }
  }

  private notify() {
    if (!this.destroyed) this.deps.onUpdate(this.snapshot())
  }

  // ─── Auth + GraphQL transport ─────────────────────────────────────────────

  private async ghToken(): Promise<string | null> {
    if (this.token) return this.token
    try {
      this.token = await new Promise<string>((resolve, reject) => {
        execFile('gh', ['auth', 'token'], { timeout: 10_000 }, (err, stdout) => {
          if (err) reject(err)
          else resolve(stdout.trim())
        })
      })
      return this.token
    } catch {
      return null
    }
  }

  private async gql(query: string, variables: Record<string, unknown>): Promise<any> {
    const token = await this.ghToken()
    if (!token) throw new Error('gh auth token unavailable')
    const res = await fetch(GQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })
    if (res.status === 401) {
      this.token = null
      throw new Error('GitHub auth expired — run `gh auth login`')
    }
    const body: any = await res.json()
    if (body?.data?.rateLimit) {
      this.rateLimit = {
        remaining: body.data.rateLimit.remaining,
        resetAt: body.data.rateLimit.resetAt,
      }
    }
    if (!res.ok || body.errors?.length) {
      const message = body.errors?.[0]?.message ?? `HTTP ${res.status}`
      const type = body.errors?.[0]?.type
      const rateLimited = type === 'RATE_LIMITED' || res.status === 403
      const err = new Error(message) as Error & { rateLimited?: boolean }
      err.rateLimited = rateLimited
      throw err
    }
    return body.data
  }

  // ─── Connect / discover ───────────────────────────────────────────────────

  async connect(cwd: string): Promise<PmSnapshot> {
    this.status = 'connecting'
    this.error = null
    this.notify()

    if (!(await this.ghToken())) {
      this.status = 'no-gh'
      this.notify()
      return this.snapshot()
    }

    const remote = this.deps.getRepoRemote(cwd)
    if (!remote) {
      this.status = 'no-remote'
      this.notify()
      return this.snapshot()
    }
    this.repo = remote

    try {
      const data = await this.gql(
        `query($owner:String!,$name:String!){
           repository(owner:$owner,name:$name){
             id
             projectsV2(first:20,query:"is:open"){ nodes { id number title } }
           }
           rateLimit { remaining resetAt }
         }`,
        { owner: remote.owner, name: remote.name },
      )
      this.repositoryId = data.repository?.id ?? null
      let projects = (data.repository?.projectsV2?.nodes ?? []).filter(Boolean)

      // Repo-linked projects are the precise answer; fall back to owner-level
      if (projects.length === 0) {
        for (const ownerType of ['organization', 'user']) {
          try {
            const od = await this.gql(
              `query($login:String!){ ${ownerType}(login:$login){ projectsV2(first:20,query:"is:open"){ nodes { id number title } } } }`,
              { login: remote.owner },
            )
            projects = (od?.[ownerType]?.projectsV2?.nodes ?? []).filter(Boolean)
            if (projects.length) break
          } catch {}
        }
      }

      this.projects = projects.map((p: any) => ({ id: p.id, number: p.number, title: p.title }))
      if (this.projects.length === 0) {
        this.status = 'no-project'
        this.notify()
        return this.snapshot()
      }
      await this.selectProject(this.projects[0].number)
    } catch (err) {
      this.status = 'error'
      this.error = err instanceof Error ? err.message : String(err)
      this.notify()
    }
    return this.snapshot()
  }

  async selectProject(number: number): Promise<void> {
    const project = this.projects.find((p) => p.number === number)
    if (!project) return
    this.selected = project
    this.status = 'connecting'
    this.notify()
    try {
      const data = await this.gql(
        `query($id:ID!){ node(id:$id){ ... on ProjectV2 {
           fields(first:30){ nodes {
             ... on ProjectV2FieldCommon { id name dataType }
             ... on ProjectV2SingleSelectField { id name dataType options { id name } }
             ... on ProjectV2IterationField { id name dataType configuration { iterations { id title startDate duration } } }
           }}
         }} rateLimit { remaining resetAt } }`,
        { id: project.id },
      )
      this.fields = parseFields(data.node?.fields?.nodes ?? [])
      await this.fetchItems()
      this.status = 'connected'
      this.error = null
      this.notify()
      this.schedulePoll()
      void this.drain()
    } catch (err) {
      this.status = 'error'
      this.error = err instanceof Error ? err.message : String(err)
      this.notify()
    }
  }

  // ─── Reads: full fetch + change probe ─────────────────────────────────────

  private async fetchItems(): Promise<void> {
    if (!this.selected) return
    const items: PmItem[] = []
    let after: string | null = null
    for (let page = 0; page < 10; page++) {
      const data: any = await this.gql(
        `query($id:ID!,$after:String){ node(id:$id){ ... on ProjectV2 {
           updatedAt
           items(first:100,after:$after){
             totalCount
             pageInfo { hasNextPage endCursor }
             nodes {
               id updatedAt type
               content {
                 ... on Issue { id number title url state repository { nameWithOwner } assignees(first:5){ nodes { login } } labels(first:10){ nodes { name color } } }
                 ... on PullRequest { id number title url state repository { nameWithOwner } }
                 ... on DraftIssue { id title }
               }
               fieldValues(first:12){ nodes {
                 ... on ProjectV2ItemFieldSingleSelectValue { name optionId field { ... on ProjectV2FieldCommon { name } } }
                 ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { name } } }
                 ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { name } } }
                 ... on ProjectV2ItemFieldIterationValue { iterationId title startDate duration field { ... on ProjectV2FieldCommon { name } } }
               }}
             }
           }
         }} rateLimit { remaining resetAt } }`,
        { id: this.selected.id, after },
      )
      const conn = data.node?.items
      this.lastProjectUpdatedAt = data.node?.updatedAt ?? this.lastProjectUpdatedAt
      this.lastTotalCount = conn?.totalCount ?? -1
      for (const n of conn?.nodes ?? []) {
        const item = parseItem(n)
        if (item) items.push(item)
      }
      if (!conn?.pageInfo?.hasNextPage) break
      after = conn.pageInfo.endCursor
    }
    this.serverItems = items
    this.lastSyncedAt = Date.now()
    // Ops that the server now reflects are settled; drop successful ghosts
    this.ops = this.ops.filter((op) => !this.opSettled(op))
    this.persistQueue()
  }

  /** An op is settled when the server snapshot already shows its result. */
  private opSettled(op: PmOp): boolean {
    const item = this.serverItems.find((i) => i.itemId === op.itemId)
    if (!item) return false
    switch (op.kind) {
      case 'setStatus':
        return item.statusOptionId === op.optionId
      case 'setPriority':
        return item.priorityOptionId === op.optionId
      case 'setDate':
        return (op.field === 'start' ? item.startDate : item.targetDate) === op.date
      default:
        return false
    }
  }

  private async probe(): Promise<boolean> {
    if (!this.selected) return false
    const data = await this.gql(
      `query($id:ID!){ node(id:$id){ ... on ProjectV2 { updatedAt items(first:1){ totalCount } } } rateLimit { remaining resetAt } }`,
      { id: this.selected.id },
    )
    const updatedAt = data.node?.updatedAt ?? null
    const total = data.node?.items?.totalCount ?? -1
    return updatedAt !== this.lastProjectUpdatedAt || total !== this.lastTotalCount
  }

  private schedulePoll() {
    if (this.pollTimer) clearTimeout(this.pollTimer)
    if (this.destroyed || this.status !== 'connected') return
    this.pollTimer = setTimeout(() => void this.pollOnce(), this.visible ? POLL_ACTIVE_MS : POLL_IDLE_MS)
  }

  private async pollOnce() {
    if (this.destroyed || !this.selected) return
    try {
      this.probesSinceFull++
      const changed = await this.probe()
      if (changed || this.probesSinceFull >= FULL_FETCH_EVERY) {
        this.probesSinceFull = 0
        await this.fetchItems()
        this.notify()
      }
    } catch {
      // transient poll failures are silent; next tick retries
    } finally {
      this.schedulePoll()
    }
  }

  setVisible(visible: boolean) {
    this.visible = visible
    this.schedulePoll()
  }

  async refresh(): Promise<void> {
    if (!this.selected) return
    try {
      await this.fetchItems()
      this.notify()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      this.notify()
    }
  }

  // ─── Writes: optimistic op queue ──────────────────────────────────────────

  enqueue(op: PmOp) {
    this.ops.push(op)
    this.persistQueue()
    this.notify()
    void this.drain()
  }

  private async drain() {
    if (this.draining || this.destroyed) return
    this.draining = true
    try {
      while (this.ops.length > 0 && this.status === 'connected' && this.selected && this.fields) {
        const op = this.ops[0]
        try {
          if (op.kind === 'create') {
            await this.executeCreate(op)
          } else {
            const doc = buildMutation(op, this.selected.id, this.fields)
            if (doc) await this.gql(doc.query, doc.variables)
          }
          this.ops.shift()
          this.persistQueue()
          this.notify()
        } catch (err) {
          op.attempts++
          if (op.attempts >= MAX_OP_ATTEMPTS) {
            // Give up: drop the op, count the failure, refetch server truth
            this.ops.shift()
            this.failedOps++
            this.persistQueue()
            this.error = `sync failed: ${err instanceof Error ? err.message : String(err)}`
            try {
              await this.fetchItems()
            } catch {}
            this.notify()
          } else {
            this.persistQueue()
            const rateLimited = (err as { rateLimited?: boolean }).rateLimited
            await sleep(rateLimited ? 60_000 : backoffMs(op.attempts))
          }
        }
      }
    } finally {
      this.draining = false
    }
  }

  /** create = createIssue → addProjectV2ItemById → set status, then swap the
   * temp item for the real one on next fetch. */
  private async executeCreate(op: Extract<PmOp, { kind: 'create' }>) {
    if (!this.repositoryId || !this.selected) throw new Error('no repository for issue create')
    const created = await this.gql(
      `mutation($repoId:ID!,$title:String!){ createIssue(input:{repositoryId:$repoId,title:$title}){ issue { id number url } } }`,
      { repoId: this.repositoryId, title: op.title },
    )
    const contentId = created.createIssue?.issue?.id
    if (!contentId) throw new Error('createIssue returned no id')
    const added = await this.gql(
      `mutation($projectId:ID!,$contentId:ID!){ addProjectV2ItemById(input:{projectId:$projectId,contentId:$contentId}){ item { id } } }`,
      { projectId: this.selected.id, contentId },
    )
    const itemId = added.addProjectV2ItemById?.item?.id
    if (itemId && op.statusOptionId && this.fields?.statusFieldId) {
      await this.gql(
        `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!){ updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}){ projectV2Item { id } } }`,
        {
          projectId: this.selected.id,
          itemId,
          fieldId: this.fields.statusFieldId,
          optionId: op.statusOptionId,
        },
      )
    }
    await this.fetchItems()
  }

  destroy() {
    this.destroyed = true
    if (this.pollTimer) clearTimeout(this.pollTimer)
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
