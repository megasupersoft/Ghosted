import { create } from 'zustand'
import type { DBStats } from '@/types/electron'
import {
  LayoutNode, LeafNode, PaneId, DEFAULT_LAYOUT, DropZone, TabEntry,
  splitLeaf as splitLeafFn,
  closeLeaf as closeLeafFn,
  splitLeafAtPosition as splitLeafAtPositionFn,
  splitLeafWithTab as splitLeafWithTabFn,
  addTabToLeaf as addTabFn,
  removeTabFromLeaf as removeTabFn,
  setActiveTabInLeaf as setActiveTabFn,
  reorderTabInLeaf as reorderTabFn,
  getSiblingLeafId,
  findLeaf,
  findLeafByTabId,
  findFirstLeafByPane,
  findTabByFilePath,
  updateTab,
  getActiveTab,
  migrateLayout,
  mkLeaf,
  mkTab,
} from './layout'

export type { PaneId } from './layout'

function loadLayout(): { layout: LayoutNode; nextNodeId: number } {
  try {
    const saved = localStorage.getItem('ghosted:layout')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.layout && parsed.nextNodeId) {
        return { layout: migrateLayout(parsed.layout), nextNodeId: parsed.nextNodeId }
      }
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

  // File content pool
  openFiles: OpenFile[]
  activeFilePath: string | null
  openFile: (path: string, name: string, content: string, fileType?: FileType) => void
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
  addTab: (leafId: string, paneType: PaneId, label?: string, filePath?: string) => void
  closeTab: (leafId: string, tabId: string) => void
  setActiveTab: (leafId: string, tabId: string) => void
  reorderTab: (leafId: string, tabId: string, toIndex: number) => void
  togglePin: (tabId: string) => void
  setFocusedLeaf: (leafId: string) => void
  setDraggingLeaf: (leafId: string | null) => void
  moveLeaf: (sourceLeafId: string, targetLeafId: string, zone: DropZone) => void
  moveTab: (sourceLeafId: string, tabId: string, targetLeafId: string, zone: DropZone) => void
}

const initial = loadLayout()

function loadWorkspacePath(): string | null {
  try {
    return localStorage.getItem('ghosted:workspacePath')
  } catch { return null }
}

function loadOpenFiles(): OpenFile[] {
  try {
    const saved = localStorage.getItem('ghosted:openFiles')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) return parsed.map((f: any) => ({ ...f, isDirty: false }))
    }
  } catch {}
  return []
}

function saveOpenFiles(files: OpenFile[]) {
  // Save file metadata + content for text files (skip large files >1MB)
  const toSave = files
    .filter(f => f.fileType === 'text' || f.fileType === 'canvas')
    .filter(f => f.content.length < 1_000_000)
    .map(f => ({ path: f.path, name: f.name, content: f.content, isDirty: false, fileType: f.fileType }))
  localStorage.setItem('ghosted:openFiles', JSON.stringify(toSave))
}

function paneTypeForExt(ext: string): PaneId {
  return ext === 'canvas' ? 'canvas' : 'editor'
}

export const useStore = create<GhostedState>((set, get) => ({
  workspacePath: loadWorkspacePath(),
  setWorkspacePath: (p) => {
    localStorage.setItem('ghosted:workspacePath', p)
    set({ workspacePath: p })
  },

  // ── File content pool (persisted to localStorage) ──────────────────────────
  openFiles: loadOpenFiles(),
  activeFilePath: null,

  openFile: (path, name, content, fileType) => {
    const { openFiles, focusedLeafId, layout, nextNodeId } = get()
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const paneType = paneTypeForExt(ext)

    // Ensure file is in the content pool
    let files = openFiles
    if (!openFiles.find(f => f.path === path)) {
      files = [...openFiles, { path, name, content, isDirty: false, fileType: fileType ?? 'text' }]
    }

    // If a tab already shows this file, switch to it
    const existing = findTabByFilePath(layout, path)
    if (existing) {
      const newLayout = setActiveTabFn(layout, existing.leaf.id, existing.tab.id)
      saveLayout(newLayout, nextNodeId)
      set({ openFiles: files, activeFilePath: path, layout: newLayout, focusedLeafId: existing.leaf.id })
      return
    }

    // Find the focused leaf's active tab
    const focusedLeaf = findLeaf(layout, focusedLeafId)
    if (!focusedLeaf) return
    const currentTab = getActiveTab(focusedLeaf)

    // Pinned tab → always create new tab
    if (currentTab.pinned) {
      const tabId = `tab-${nextNodeId}`
      const newLayout = addTabFn(layout, focusedLeafId, mkTab(tabId, paneType, name, path))
      saveLayout(newLayout, nextNodeId + 1)
      set({ openFiles: files, activeFilePath: path, layout: newLayout, nextNodeId: nextNodeId + 1 })
      return
    }

    // Empty tab (no file) → reuse it
    if (!currentTab.filePath) {
      const newLayout = updateTab(layout, currentTab.id, { paneType, label: name, filePath: path })
      saveLayout(newLayout, nextNodeId)
      set({ openFiles: files, activeFilePath: path, layout: newLayout })
      return
    }

    // Tab already has a file → create new tab
    const tabId = `tab-${nextNodeId}`
    const newLayout = addTabFn(layout, focusedLeafId, mkTab(tabId, paneType, name, path))
    saveLayout(newLayout, nextNodeId + 1)
    set({ openFiles: files, activeFilePath: path, layout: newLayout, nextNodeId: nextNodeId + 1 })
  },

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

  // ── Layout ─────────────────────────────────────────────────────────────────
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
    const { layout, nextNodeId } = get()
    const siblingId = getSiblingLeafId(layout, leafId)
    const newLayout = closeLeafFn(layout, leafId)
    saveLayout(newLayout, nextNodeId)
    set({ layout: newLayout, focusedLeafId: siblingId ?? 'leaf-1' })
  },

  addTab: (leafId, paneType, label, filePath) => {
    const { layout, nextNodeId } = get()
    const tabId = `tab-${nextNodeId}`
    const tab = mkTab(tabId, paneType, label, filePath)
    const newLayout = addTabFn(layout, leafId, tab)
    const newNextId = nextNodeId + 1
    saveLayout(newLayout, newNextId)
    set({ layout: newLayout, nextNodeId: newNextId })
  },

  closeTab: (leafId, tabId) => {
    const { layout, nextNodeId, openFiles } = get()
    const leaf = findLeaf(layout, leafId)
    if (!leaf) return
    if (leaf.tabs.length <= 1) {
      get().closeLeaf(leafId)
      return
    }
    const tab = leaf.tabs.find(t => t.id === tabId)
    const newLayout = removeTabFn(layout, leafId, tabId)
    saveLayout(newLayout, nextNodeId)
    // Clean up file from pool if no other tab references it
    let files = openFiles
    if (tab?.filePath) {
      const stillReferenced = findTabByFilePath(newLayout, tab.filePath)
      if (!stillReferenced) {
        files = openFiles.filter(f => f.path !== tab.filePath)
      }
    }
    set({ layout: newLayout, openFiles: files })
  },

  setActiveTab: (leafId, tabId) => {
    const { layout, nextNodeId } = get()
    const newLayout = setActiveTabFn(layout, leafId, tabId)
    saveLayout(newLayout, nextNodeId)
    // Update activeFilePath to match the switched tab
    const leaf = findLeaf(newLayout, leafId)
    const tab = leaf?.tabs.find(t => t.id === tabId)
    set({ layout: newLayout, activeFilePath: tab?.filePath ?? get().activeFilePath })
  },

  reorderTab: (leafId, tabId, toIndex) => {
    const { layout, nextNodeId } = get()
    const newLayout = reorderTabFn(layout, leafId, tabId, toIndex)
    saveLayout(newLayout, nextNodeId)
    set({ layout: newLayout })
  },

  togglePin: (tabId) => {
    const { layout, nextNodeId } = get()
    const leaf = findLeafByTabId(layout, tabId)
    if (!leaf) return
    const tab = leaf.tabs.find(t => t.id === tabId)
    if (!tab) return
    const newLayout = updateTab(layout, tabId, { pinned: !tab.pinned })
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
      let l = layout
      for (const tab of sourceLeaf.tabs) {
        l = addTabFn(l, targetLeafId, tab)
      }
      l = closeLeafFn(l, sourceLeafId)
      newLayout = l
      newFocusId = targetLeafId
    } else {
      const activeSourceTab = getActiveTab(sourceLeaf)
      const allSourceTabs = [...sourceLeaf.tabs]
      newLayout = closeLeafFn(layout, sourceLeafId)
      const direction: 'horizontal' | 'vertical' =
        (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical'
      const insertBefore = zone === 'left' || zone === 'top'
      const newSplitId = `split-${newNextId}`
      newNextId++
      // Use splitLeafWithTab to preserve the active tab's original ID
      newLayout = splitLeafWithTabFn(
        newLayout, targetLeafId, direction, sourceLeafId, newSplitId, activeSourceTab, insertBefore
      )
      // Re-add remaining tabs (their IDs are already preserved)
      for (const t of allSourceTabs) {
        if (t.id === activeSourceTab.id) continue
        newLayout = addTabFn(newLayout, sourceLeafId, t)
      }
      newFocusId = sourceLeafId
    }

    saveLayout(newLayout, newNextId)
    set({ layout: newLayout, nextNodeId: newNextId, focusedLeafId: newFocusId, draggingLeafId: null })
  },

  moveTab: (sourceLeafId, tabId, targetLeafId, zone) => {
    const { layout, nextNodeId } = get()
    const sourceLeaf = findLeaf(layout, sourceLeafId)
    if (!sourceLeaf) return
    const tab = sourceLeaf.tabs.find(t => t.id === tabId)
    if (!tab) return

    let newLayout: LayoutNode
    let newNextId = nextNodeId
    let newFocusId: string

    if (zone === 'center') {
      newLayout = addTabFn(layout, targetLeafId, tab)
      if (sourceLeaf.tabs.length <= 1) {
        newLayout = closeLeafFn(newLayout, sourceLeafId)
      } else {
        newLayout = removeTabFn(newLayout, sourceLeafId, tabId)
      }
      newFocusId = targetLeafId
    } else {
      const newLeafId = `leaf-${newNextId}`
      const newSplitId = `split-${newNextId + 1}`
      newNextId += 2
      const direction: 'horizontal' | 'vertical' =
        (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical'
      const insertBefore = zone === 'left' || zone === 'top'

      if (sourceLeaf.tabs.length <= 1) {
        newLayout = closeLeafFn(layout, sourceLeafId)
      } else {
        newLayout = removeTabFn(layout, sourceLeafId, tabId)
      }
      // Use splitLeafWithTab to preserve the original tab (and its ID)
      newLayout = splitLeafWithTabFn(
        newLayout, targetLeafId, direction, newLeafId, newSplitId, tab, insertBefore
      )
      newFocusId = newLeafId
    }

    saveLayout(newLayout, newNextId)
    set({ layout: newLayout, nextNodeId: newNextId, focusedLeafId: newFocusId, draggingLeafId: null })
  },
}))

// Persist open files to localStorage (debounced)
let _saveFilesTimer: ReturnType<typeof setTimeout>
useStore.subscribe((state, prev) => {
  if (state.openFiles !== prev.openFiles) {
    clearTimeout(_saveFilesTimer)
    _saveFilesTimer = setTimeout(() => saveOpenFiles(state.openFiles), 500)
  }
})

// Helper for FileTree: find focused editor leaf or first editor leaf
export function getEditorLeafId(): string | null {
  const { layout, focusedLeafId } = useStore.getState()
  const check = (tree: LayoutNode): LeafNode | null => {
    if (tree.type === 'leaf') {
      if (tree.id !== focusedLeafId) return null
      return tree.tabs.some(t => t.paneType === 'editor') ? tree : null
    }
    return check(tree.children[0]) ?? check(tree.children[1])
  }
  const focused = check(layout)
  if (focused) return focused.id
  const first = findFirstLeafByPane(layout, 'editor')
  return first?.id ?? null
}
