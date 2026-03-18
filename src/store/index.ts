import { create } from 'zustand'

export type PaneId = 'editor' | 'terminal' | 'graph' | 'canvas' | 'kanban'

const DEFAULT_PANE_ORDER: PaneId[] = ['editor', 'terminal', 'graph', 'canvas', 'kanban']

function loadPaneOrder(): PaneId[] {
  try {
    const saved = localStorage.getItem('ghosted:paneOrder')
    if (saved) {
      const parsed = JSON.parse(saved) as PaneId[]
      // Validate: must contain all 5 pane IDs
      if (parsed.length === 5 && DEFAULT_PANE_ORDER.every(id => parsed.includes(id))) return parsed
    }
  } catch {}
  return DEFAULT_PANE_ORDER
}

function loadActivePane(): PaneId {
  try {
    const saved = localStorage.getItem('ghosted:activePane')
    if (saved && DEFAULT_PANE_ORDER.includes(saved as PaneId)) return saved as PaneId
  } catch {}
  return 'editor'
}

export interface OpenFile {
  path: string; name: string; content: string; isDirty: boolean
}

interface GhostedState {
  workspacePath: string | null
  setWorkspacePath: (p: string) => void
  openFiles: OpenFile[]
  activeFilePath: string | null
  openFile: (path: string, name: string, content: string) => void
  closeFile: (path: string) => void
  setActiveFile: (path: string) => void
  updateFileContent: (path: string, content: string) => void
  markFileDirty: (path: string, dirty: boolean) => void
  activePane: PaneId
  setActivePane: (p: PaneId) => void
  paneOrder: PaneId[]
  setPaneOrder: (order: PaneId[]) => void
  githubToken: string | null
  setGithubToken: (t: string) => void
}

export const useStore = create<GhostedState>((set, get) => ({
  workspacePath: null,
  setWorkspacePath: (p) => set({ workspacePath: p }),
  openFiles: [],
  activeFilePath: null,
  openFile: (path, name, content) => {
    const { openFiles } = get()
    if (openFiles.find(f => f.path === path)) { set({ activeFilePath: path }); return }
    set({ openFiles: [...openFiles, { path, name, content, isDirty: false }], activeFilePath: path })
  },
  closeFile: (path) => {
    const { openFiles, activeFilePath } = get()
    const next = openFiles.filter(f => f.path !== path)
    set({ openFiles: next, activeFilePath: activeFilePath === path ? (next[next.length - 1]?.path ?? null) : activeFilePath })
  },
  setActiveFile: (path) => set({ activeFilePath: path }),
  updateFileContent: (path, content) => set({ openFiles: get().openFiles.map(f => f.path === path ? { ...f, content } : f) }),
  markFileDirty: (path, dirty) => set({ openFiles: get().openFiles.map(f => f.path === path ? { ...f, isDirty: dirty } : f) }),
  activePane: loadActivePane(),
  setActivePane: (p) => { localStorage.setItem('ghosted:activePane', p); set({ activePane: p }) },
  paneOrder: loadPaneOrder(),
  setPaneOrder: (order) => { localStorage.setItem('ghosted:paneOrder', JSON.stringify(order)); set({ paneOrder: order }) },
  githubToken: null,
  setGithubToken: (t) => set({ githubToken: t }),
}))
