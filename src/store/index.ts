import { create } from 'zustand'
import type { DBStats } from '@/types/electron'
import {
  LayoutNode, LeafNode, PaneId, DEFAULT_LAYOUT, DropZone, TabEntry,
  splitLeaf as splitLeafFn,
  closeLeaf as closeLeafFn,
  changeLeafPane as changeLeafPaneFn,
  splitLeafAtPosition as splitLeafAtPositionFn,
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
  openFiles: OpenFile[]
  activeFilePath: string | null
  leafActiveFile: Record<string, string | null>
  openFile: (path: string, name: string, content: string, fileType?: FileType) => void
  openFileInLeaf: (leafId: string, path: string, name: string, content: string, fileType?: FileType) => void
  newUntitledFile: (leafId?: string) => void
  closeFile: (path: string, leafId?: string) => void
  setActiveFile: (path: string, leafId?: string) => void
  getActiveFileForLeaf: (leafId: string) => string | null
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
  addTab: (leafId: string, paneType: PaneId) => void
  closeTab: (leafId: string, tabId: string) => void
  setActiveTab: (leafId: string, tabId: string) => void
  reorderTab: (leafId: string, tabId: string, toIndex: number) => void
  setFocusedLeaf: (leafId: string) => void
  setDraggingLeaf: (leafId: string | null) => void
  moveLeaf: (sourceLeafId: string, targetLeafId: string, zone: DropZone) => void
  moveTab: (sourceLeafId: string, tabId: string, targetLeafId: string, zone: DropZone) => void
  pinnedTabs: Record<string, boolean>
  togglePin: (tabId: string) => void
  isTabPinned: (tabId: string) => boolean
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
  leafActiveFile: {},
  openFile: (path, name, content, fileType) => {
    const { openFiles, focusedLeafId, layout, nextNodeId } = get()
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const paneType: PaneId = ext === 'canvas' ? 'canvas' : 'editor'

    // Ensure file is in openFiles pool
    let newOpenFiles = openFiles
    if (!openFiles.find(f => f.path === path)) {
      newOpenFiles = [...openFiles, { path, name, content, isDirty: false, fileType: fileType ?? 'text' }]
    }

    // Check if a tab already has this file open — switch to it
    const existing = findTabByFilePath(layout, path)
    if (existing) {
      const newLayout = setActiveTabFn(layout, existing.leaf.id, existing.tab.id)
      saveLayout(newLayout, nextNodeId)
      set({ openFiles: newOpenFiles, activeFilePath: path, layout: newLayout, focusedLeafId: existing.leaf.id })
      return
    }

    // Find the focused leaf and its active tab
    const focusedLeaf = findLeaf(layout, focusedLeafId)
    if (!focusedLeaf) return

    const currentTab = getActiveTab(focusedLeaf)

    // If current tab is pinned, create a new tab
    if (currentTab.pinned) {
      const tabId = `tab-${nextNodeId}`
      const tab = mkTab(tabId, paneType, name, path)
      const newLayout = addTabFn(layout, focusedLeafId, tab)
      saveLayout(newLayout, nextNodeId + 1)
      set({ openFiles: newOpenFiles, activeFilePath: path, layout: newLayout, nextNodeId: nextNodeId + 1 })
      return
    }

    // Update the current tab to show this file
    const newLayout = updateTab(layout, currentTab.id, { paneType, label: name, filePath: path })
    saveLayout(newLayout, nextNodeId)
    set({ openFiles: newOpenFiles, activeFilePath: path, layout: newLayout })
  },
  openFileInLeaf: (leafId, path, name, content, fileType) => {
    const { openFiles, layout, nextNodeId } = get()
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const paneType: PaneId = ext === 'canvas' ? 'canvas' : 'editor'

    let newOpenFiles = openFiles
    if (!openFiles.find(f => f.path === path)) {
      newOpenFiles = [...openFiles, { path, name, content, isDirty: false, fileType: fileType ?? 'text' }]
    }

    const tabId = `tab-${nextNodeId}`
    const tab = mkTab(tabId, paneType, name, path)
    const newLayout = addTabFn(layout, leafId, tab)
    saveLayout(newLayout, nextNodeId + 1)
    set({ openFiles: newOpenFiles, activeFilePath: path, layout: newLayout, nextNodeId: nextNodeId + 1 })
  },
  newUntitledFile: (leafId) => {
    const { openFiles, focusedLeafId, layout, nextNodeId } = get()
    const lid = leafId ?? focusedLeafId
    const existing = openFiles.filter(f => f.path.startsWith('untitled:'))
    let n = 1
    while (existing.some(f => f.path === `untitled:${n}`)) n++
    const path = `untitled:${n}`
    const name = `untitled-${n}`
    const tabId = `tab-${nextNodeId}`
    const tab = mkTab(tabId, 'editor', name, path)
    const newLayout = addTabFn(layout, lid, tab)
    saveLayout(newLayout, nextNodeId + 1)
    set({
      openFiles: [...openFiles, { path, name, content: '', isDirty: false, fileType: 'text' }],
      activeFilePath: path,
      layout: newLayout,
      nextNodeId: nextNodeId + 1,
    })
  },
  closeFile: (path, leafId) => {
    const { openFiles, activeFilePath, focusedLeafId, leafActiveFile } = get()
    const lid = leafId ?? focusedLeafId
    const next = openFiles.filter(f => f.path !== path)
    const newLeafActive = { ...leafActiveFile }
    for (const [k, v] of Object.entries(newLeafActive)) {
      if (v === path) newLeafActive[k] = next[next.length - 1]?.path ?? null
    }
    set({
      openFiles: next,
      activeFilePath: activeFilePath === path ? (next[next.length - 1]?.path ?? null) : activeFilePath,
      leafActiveFile: newLeafActive,
    })
  },
  setActiveFile: (path, leafId) => {
    const { focusedLeafId, leafActiveFile } = get()
    const lid = leafId ?? focusedLeafId
    set({ activeFilePath: path, leafActiveFile: { ...leafActiveFile, [lid]: path } })
  },
  getActiveFileForLeaf: (leafId) => {
    const { leafActiveFile, activeFilePath } = get()
    return leafActiveFile[leafId] ?? activeFilePath
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

  addTab: (leafId, paneType) => {
    const { layout, nextNodeId } = get()
    const tabId = `tab-${nextNodeId}`
    const tab: TabEntry = { id: tabId, paneType }
    const newLayout = addTabFn(layout, leafId, tab)
    const newNextId = nextNodeId + 1
    saveLayout(newLayout, newNextId)
    set({ layout: newLayout, nextNodeId: newNextId })
  },

  closeTab: (leafId, tabId) => {
    const { layout, nextNodeId } = get()
    const leaf = findLeaf(layout, leafId)
    if (!leaf) return
    if (leaf.tabs.length <= 1) {
      // Last tab — close the whole leaf
      get().closeLeaf(leafId)
      return
    }
    const newLayout = removeTabFn(layout, leafId, tabId)
    saveLayout(newLayout, nextNodeId)
    set({ layout: newLayout })
  },

  setActiveTab: (leafId, tabId) => {
    const { layout, nextNodeId } = get()
    const newLayout = setActiveTabFn(layout, leafId, tabId)
    saveLayout(newLayout, nextNodeId)
    set({ layout: newLayout })
  },

  reorderTab: (leafId, tabId, toIndex) => {
    const { layout, nextNodeId } = get()
    const newLayout = reorderTabFn(layout, leafId, tabId, toIndex)
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
      // Stack: move all source tabs into target leaf, then close source
      let l = layout
      for (const tab of sourceLeaf.tabs) {
        l = addTabFn(l, targetLeafId, tab)
      }
      l = closeLeafFn(l, sourceLeafId)
      newLayout = l
      newFocusId = targetLeafId
    } else {
      const sourcePaneType = getActiveTab(sourceLeaf).paneType
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
      // Stack the tab into the target leaf
      newLayout = addTabFn(layout, targetLeafId, tab)
      // Remove from source (or close source if last tab)
      if (sourceLeaf.tabs.length <= 1) {
        newLayout = closeLeafFn(newLayout, sourceLeafId)
      } else {
        newLayout = removeTabFn(newLayout, sourceLeafId, tabId)
      }
      newFocusId = targetLeafId
    } else {
      // Split: create a new leaf with this tab
      const newLeafId = `leaf-${newNextId}`
      const newSplitId = `split-${newNextId + 1}`
      newNextId += 2
      const direction: 'horizontal' | 'vertical' =
        (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical'
      const insertBefore = zone === 'left' || zone === 'top'

      // Remove tab from source first
      if (sourceLeaf.tabs.length <= 1) {
        newLayout = closeLeafFn(layout, sourceLeafId)
      } else {
        newLayout = removeTabFn(layout, sourceLeafId, tabId)
      }
      newLayout = splitLeafAtPositionFn(
        newLayout, targetLeafId, direction, newLeafId, newSplitId, tab.paneType, insertBefore
      )
      newFocusId = newLeafId
    }

    saveLayout(newLayout, newNextId)
    set({ layout: newLayout, nextNodeId: newNextId, focusedLeafId: newFocusId, draggingLeafId: null })
  },

  pinnedTabs: {},
  togglePin: (tabId) => {
    const { layout, nextNodeId } = get()
    // Toggle pinned in the layout tree
    const leaf = findLeafByTabId(layout, tabId)
    if (!leaf) return
    const tab = leaf.tabs.find(t => t.id === tabId)
    if (!tab) return
    const newLayout = updateTab(layout, tabId, { pinned: !tab.pinned })
    saveLayout(newLayout, nextNodeId)
    set({ layout: newLayout })
  },
  isTabPinned: (tabId) => {
    const leaf = findLeafByTabId(get().layout, tabId)
    if (!leaf) return false
    return !!leaf.tabs.find(t => t.id === tabId)?.pinned
  },
}))

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
