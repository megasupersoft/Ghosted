/**
 * PM store — one board model for both backends:
 *  - 'github': mirror of the main-process sync engine snapshot (optimism and
 *    reconciliation happen there; this store just renders snapshots)
 *  - 'local':  offline board persisted to `.ghosted/kanban.json` in the
 *    workspace — same PmItem shape so the panes don't care
 */

import { create } from 'zustand'
import type { PmFieldOption, PmItem, PmOp, PmSnapshot } from '../../electron/pmShared'

export type PmMode = 'none' | 'connecting' | 'github' | 'local'

const LOCAL_COLUMNS: PmFieldOption[] = [
  { id: 'Backlog', name: 'Backlog' },
  { id: 'In Progress', name: 'In Progress' },
  { id: 'Done', name: 'Done' },
]

let opCounter = 0
const nextOpId = () => `op-${Date.now()}-${++opCounter}`
export const nextTempId = () => `temp-${Date.now()}-${++opCounter}`

function localFilePath(workspacePath: string) {
  return `${workspacePath}/.ghosted/kanban.json`
}

export function localItem(title: string, status: string): PmItem {
  return {
    itemId: nextTempId(),
    contentId: null,
    contentType: 'DraftIssue',
    number: null,
    title,
    url: null,
    state: null,
    repo: null,
    assignees: [],
    labels: [],
    status,
    statusOptionId: status,
    priority: null,
    priorityOptionId: null,
    startDate: null,
    targetDate: null,
    effort: null,
    iterationId: null,
    iterationTitle: null,
    updatedAt: new Date().toISOString(),
  }
}

interface PmState {
  mode: PmMode
  snapshot: PmSnapshot | null
  localItems: PmItem[]
  initialized: boolean

  // Derived helpers
  items: () => PmItem[]
  columns: () => PmFieldOption[]

  // Lifecycle
  init: (workspacePath: string) => Promise<void>
  applySnapshot: (s: PmSnapshot) => void
  setVisible: (v: boolean) => void
  refresh: () => void
  selectProject: (n: number) => void

  // Mutations (routed to the right backend)
  setStatus: (item: PmItem, option: PmFieldOption | null) => void
  setDates: (item: PmItem, start: string | null, target: string | null) => void
  reorder: (item: PmItem, afterItemId: string | null) => void
  createItem: (title: string, statusOption: PmFieldOption | null) => void
}

async function saveLocal(items: PmItem[]) {
  const ws = localStorage.getItem('ghosted:workspacePath')
  if (!ws) return
  try {
    await window.electron.fs.mkdir(`${ws}/.ghosted`)
    await window.electron.fs.writefile(localFilePath(ws), JSON.stringify({ items }, null, 2))
  } catch {}
}

export const usePmStore = create<PmState>((set, get) => ({
  mode: 'none',
  snapshot: null,
  localItems: [],
  initialized: false,

  items: () => {
    const s = get()
    return s.mode === 'github' ? (s.snapshot?.items ?? []) : s.localItems
  },

  columns: () => {
    const s = get()
    if (s.mode === 'github' && s.snapshot?.fields?.statusOptions.length) {
      return s.snapshot.fields.statusOptions
    }
    return LOCAL_COLUMNS
  },

  init: async (workspacePath: string) => {
    set({ mode: 'connecting', initialized: true })
    window.electron.pm.onUpdate((snapshot) => get().applySnapshot(snapshot))
    const snapshot = await window.electron.pm.connect(workspacePath)
    if (snapshot.status === 'connected' || snapshot.status === 'connecting') {
      set({ mode: 'github', snapshot })
      return
    }
    // Offline / no remote / no project → local board
    let items: PmItem[] = []
    try {
      const raw = await window.electron.fs.readfile(localFilePath(workspacePath))
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.items)) items = parsed.items
    } catch {}
    set({ mode: 'local', snapshot, localItems: items })
  },

  applySnapshot: (snapshot) => {
    if (snapshot.status === 'connected') {
      set({ mode: 'github', snapshot })
    } else {
      set((s) => ({ snapshot, mode: s.mode === 'github' && snapshot.status === 'error' ? 'github' : s.mode }))
    }
  },

  setVisible: (v) => {
    if (get().mode === 'github') void window.electron.pm.visibility(v)
  },

  refresh: () => {
    if (get().mode === 'github') void window.electron.pm.refresh()
  },

  selectProject: (n) => {
    void window.electron.pm.select(n)
  },

  setStatus: (item, option) => {
    const s = get()
    if (s.mode === 'github') {
      const op: PmOp = {
        opId: nextOpId(),
        kind: 'setStatus',
        itemId: item.itemId,
        optionId: option?.id ?? null,
        display: option?.name ?? null,
        prevOptionId: item.statusOptionId,
        prevDisplay: item.status,
        attempts: 0,
      }
      void window.electron.pm.op(op)
    } else {
      const localItems = s.localItems.map((i) =>
        i.itemId === item.itemId
          ? { ...i, status: option?.name ?? null, statusOptionId: option?.id ?? null }
          : i,
      )
      set({ localItems })
      void saveLocal(localItems)
    }
  },

  setDates: (item, start, target) => {
    const s = get()
    if (s.mode === 'github') {
      if (start !== item.startDate) {
        void window.electron.pm.op({
          opId: nextOpId(),
          kind: 'setDate',
          itemId: item.itemId,
          field: 'start',
          date: start,
          prevDate: item.startDate,
          attempts: 0,
        } satisfies PmOp)
      }
      if (target !== item.targetDate) {
        void window.electron.pm.op({
          opId: nextOpId(),
          kind: 'setDate',
          itemId: item.itemId,
          field: 'target',
          date: target,
          prevDate: item.targetDate,
          attempts: 0,
        } satisfies PmOp)
      }
    } else {
      const localItems = s.localItems.map((i) =>
        i.itemId === item.itemId ? { ...i, startDate: start, targetDate: target } : i,
      )
      set({ localItems })
      void saveLocal(localItems)
    }
  },

  reorder: (item, afterItemId) => {
    const s = get()
    if (s.mode === 'github') {
      void window.electron.pm.op({
        opId: nextOpId(),
        kind: 'reorder',
        itemId: item.itemId,
        afterItemId,
        attempts: 0,
      } satisfies PmOp)
    } else {
      const rest = s.localItems.filter((i) => i.itemId !== item.itemId)
      const idx = afterItemId ? rest.findIndex((i) => i.itemId === afterItemId) + 1 : 0
      rest.splice(idx, 0, item)
      set({ localItems: rest })
      void saveLocal(rest)
    }
  },

  createItem: (title, statusOption) => {
    const s = get()
    if (s.mode === 'github') {
      void window.electron.pm.op({
        opId: nextOpId(),
        kind: 'create',
        itemId: nextTempId(),
        title,
        statusOptionId: statusOption?.id ?? null,
        statusDisplay: statusOption?.name ?? null,
        attempts: 0,
      } satisfies PmOp)
    } else {
      const localItems = [...s.localItems, localItem(title, statusOption?.name ?? 'Backlog')]
      set({ localItems })
      void saveLocal(localItems)
    }
  },
}))
