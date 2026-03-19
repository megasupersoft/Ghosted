import { create } from 'zustand'
import type { DBStats } from '@/types/electron'
import {
  LayoutNode, LeafNode, PaneId, DEFAULT_LAYOUT, DropZone,
  splitLeaf as splitLeafFn,
  closeLeaf as closeLeafFn,
  changeLeafPane as changeLeafPaneFn,
  splitLeafAtPosition as splitLeafAtPositionFn,
  getSiblingLeafId,
  findLeaf,
  findFirstLeafByPane,
} from './layout'

export type { PaneId } from './layout'

function loadLayout(): { layout: LayoutNode; nextNodeId: number } {
  try {
    const saved = localStorage.getItem('ghosted:layout')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.layout && parsed.nextNodeId) return parsed
    }
  } catch {}
  return { layout: DEFAULT_LAYOUT, nextNodeId: 2 }
}

function saveLayout(layout: LayoutNode, nextNodeId: number) {
  localStorage.setItem('ghosted:layout', JSON.stringify({ layout, nextNodeId }))
}

export type FileType = 'text' | 'image' | 'video' | 'canvas'

export interface OpenFile {
  path: string; name: string; content: string; isDirty: boolean; fileType: FileType
}

interface GhostedState {
  workspacePath: string | null
  setWorkspacePath: (p: string) => void
  openFiles: OpenFile[]
  activeFilePath: string | null
  openFile: (path: string, name: string, content: string, fileType?: FileType) => void
  newUntitledFile: () => void
  closeFile: (path: string) => void
  setActiveFile: (path: string) => void
  updateFileContent: (path: string, content: string) => void
  markFileDirty: (path: string, dirty: boolean) => void
  githubToken: string | null
  setGithubToken: (t: string) => void

  // GhostedDB
  dbStats: DBStats | null
  dbReady: boolean
  setDbStats: (s: DBStats) => void
  setDbReady: (r: boolean) => void

  // Sidebar
  activeSidebar: string | null
  toggleSidebar: (id: string) => void

  // Status bar
  statusMessages: { id: number; level: 'info' | 'warn' | 'error'; text: string; time: number }[]
  addStatus: (level: 'info' | 'warn' | 'error', text: string) => void
  clearStatus: () => void

  // Layout
  layout: LayoutNode
  focusedLeafId: string
  nextNodeId: number
  draggingLeafId: string | null
  splitLeaf: (leafId: string, direction: 'horizontal' | 'vertical') => void
  closeLeaf: (leafId: string) => void
  changeLeafPane: (leafId: string, paneType: PaneId) => void
  setFocusedLeaf: (leafId: string) => void
  setDraggingLeaf: (leafId: string | null) => void
  moveLeaf: (sourceLeafId: string, targetLeafId: string, zone: DropZone) => void
}

const initial = loadLayout()

function loadWorkspacePath(): string | null {
  try {
    return localStorage.getItem('ghosted:workspacePath')
  } catch { return null }
}

export const useStore = create<GhostedState>((set, get) => ({
  workspacePath: loadWorkspacePath(),
  setWorkspacePath: (p) => {
    localStorage.setItem('ghosted:workspacePath', p)
    set({ workspacePath: p })
  },
  openFiles: [],
  activeFilePath: null,
  openFile: (path, name, content, fileType) => {
    const { openFiles } = get()
    if (openFiles.find(f => f.path === path)) { set({ activeFilePath: path }); return }
    set({ openFiles: [...openFiles, { path, name, content, isDirty: false, fileType: fileType ?? 'text' }], activeFilePath: path })
  },
  newUntitledFile: () => {
    const { openFiles } = get()
    const existing = openFiles.filter(f => f.path.startsWith('untitled:'))
    let n = 1
    while (existing.some(f => f.path === `untitled:${n}`)) n++
    const path = `untitled:${n}`
    const name = `untitled-${n}`
    set({ openFiles: [...openFiles, { path, name, content: '', isDirty: false, fileType: 'text' }], activeFilePath: path })
  },
  closeFile: (path) => {
    const { openFiles, activeFilePath } = get()
    const next = openFiles.filter(f => f.path !== path)
    set({ openFiles: next, activeFilePath: activeFilePath === path ? (next[next.length - 1]?.path ?? null) : activeFilePath })
  },
  setActiveFile: (path) => set({ activeFilePath: path }),
  updateFileContent: (path, content) => set({ openFiles: get().openFiles.map(f => f.path === path ? { ...f, content } : f) }),
  markFileDirty: (path, dirty) => set({ openFiles: get().openFiles.map(f => f.path === path ? { ...f, isDirty: dirty } : f) }),
  githubToken: null,
  setGithubToken: (t) => set({ githubToken: t }),

  // GhostedDB
  dbStats: null,
  dbReady: false,
  setDbStats: (s) => set({ dbStats: s }),
  setDbReady: (r) => set({ dbReady: r }),

  // Sidebar
  activeSidebar: 'explorer',
  toggleSidebar: (id) => {
    const { activeSidebar } = get()
    set({ activeSidebar: activeSidebar === id ? null : id })
  },

  // Status bar
  statusMessages: [],
  addStatus: (level, text) => {
    const { statusMessages } = get()
    const msg = { id: Date.now(), level, text, time: Date.now() }
    set({ statusMessages: [...statusMessages.slice(-49), msg] })
  },
  clearStatus: () => set({ statusMessages: [] }),

  // Layout state
  layout: initial.layout,
  focusedLeafId: 'leaf-1',
  nextNodeId: initial.nextNodeId,
  draggingLeafId: null,

  splitLeaf: (leafId, direction) => {
    const { layout, nextNodeId } = get()
    const newLeafId = `leaf-${nextNodeId}`
    const newSplitId = `split-${nextNodeId}`
    const newLayout = splitLeafFn(layout, leafId, direction, newLeafId, newSplitId)
    const newNextId = nextNodeId + 1
    saveLayout(newLayout, newNextId)
    set({ layout: newLayout, nextNodeId: newNextId, focusedLeafId: newLeafId })
  },

  closeLeaf: (leafId) => {
    const { layout } = get()
    const siblingId = getSiblingLeafId(layout, leafId)
    const newLayout = closeLeafFn(layout, leafId)
    const { nextNodeId } = get()
    saveLayout(newLayout, nextNodeId)
    set({ layout: newLayout, focusedLeafId: siblingId ?? 'leaf-1' })
  },

  changeLeafPane: (leafId, paneType) => {
    const { layout, nextNodeId } = get()
    const newLayout = changeLeafPaneFn(layout, leafId, paneType)
    saveLayout(newLayout, nextNodeId)
    set({ layout: newLayout })
  },

  setFocusedLeaf: (leafId) => set({ focusedLeafId: leafId }),

  setDraggingLeaf: (leafId) => set({ draggingLeafId: leafId }),

  moveLeaf: (sourceLeafId, targetLeafId, zone) => {
    if (sourceLeafId === targetLeafId) return
    const { layout, nextNodeId } = get()
    const sourceLeaf = findLeaf(layout, sourceLeafId)
    const targetLeaf = findLeaf(layout, targetLeafId)
    if (!sourceLeaf || !targetLeaf) return

    let newLayout: LayoutNode
    let newNextId = nextNodeId
    let newFocusId: string

    if (zone === 'center') {
      // Swap pane types
      newLayout = changeLeafPaneFn(layout, sourceLeafId, targetLeaf.paneType)
      newLayout = changeLeafPaneFn(newLayout, targetLeafId, sourceLeaf.paneType)
      newFocusId = targetLeafId
    } else {
      // Edge drop: remove source, split target, reuse source leaf ID to preserve terminals
      const sourcePaneType = sourceLeaf.paneType
      newLayout = closeLeafFn(layout, sourceLeafId)
      const direction: 'horizontal' | 'vertical' =
        (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical'
      const insertBefore = zone === 'left' || zone === 'top'
      const newSplitId = `split-${newNextId}`
      newNextId++
      newLayout = splitLeafAtPositionFn(
        newLayout, targetLeafId, direction, sourceLeafId, newSplitId, sourcePaneType, insertBefore
      )
      newFocusId = sourceLeafId
    }

    saveLayout(newLayout, newNextId)
    set({ layout: newLayout, nextNodeId: newNextId, focusedLeafId: newFocusId, draggingLeafId: null })
  },
}))

// Helper for FileTree: find focused editor leaf or first editor leaf
export function getEditorLeafId(): string | null {
  const { layout, focusedLeafId } = useStore.getState()
  // Check if focused leaf is an editor
  const check = (tree: LayoutNode): LeafNode | null => {
    if (tree.type === 'leaf') return tree.id === focusedLeafId && tree.paneType === 'editor' ? tree : null
    return check(tree.children[0]) ?? check(tree.children[1])
  }
  const focused = check(layout)
  if (focused) return focused.id
  // Otherwise find first editor leaf
  const first = findFirstLeafByPane(layout, 'editor')
  return first?.id ?? null
}
