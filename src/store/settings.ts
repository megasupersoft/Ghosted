import { create } from 'zustand'

export interface GhostedSettings {
  editorFontSize: number
  editorFontFamily: string
  editorTabSize: number
  editorWordWrap: 'on' | 'off' | 'wordWrapColumn'
  editorLineNumbers: 'on' | 'off' | 'relative'
  editorMinimap: boolean
  editorBracketColors: boolean
  editorSmoothScrolling: boolean
  editorSmoothCaret: boolean
  editorLigatures: boolean
  terminalFontSize: number
  terminalFontFamily: string
  terminalLineHeight: number
  terminalCursorBlink: boolean
  terminalCursorStyle: 'block' | 'underline' | 'bar'
  terminalScrollback: number
  accentColor: string
  uiFontSize: number
  showHiddenFiles: boolean
  gitAutoRefreshInterval: number
  gitAutoStageOnCommit: boolean
  defaultPane: string
  sidebarDefaultWidth: number
}

export const DEFAULTS: GhostedSettings = {
  editorFontSize: 14,
  editorFontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
  editorTabSize: 2,
  editorWordWrap: 'on',
  editorLineNumbers: 'on',
  editorMinimap: false,
  editorBracketColors: true,
  editorSmoothScrolling: true,
  editorSmoothCaret: true,
  editorLigatures: true,
  terminalFontSize: 12,
  terminalFontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
  terminalLineHeight: 1,
  terminalCursorBlink: true,
  terminalCursorStyle: 'bar',
  terminalScrollback: 5000,
  accentColor: '#8b7cf8',
  uiFontSize: 14,
  showHiddenFiles: true,
  gitAutoRefreshInterval: 5,
  gitAutoStageOnCommit: true,
  defaultPane: 'editor',
  sidebarDefaultWidth: 18,
}

function load(): GhostedSettings {
  try {
    const saved = localStorage.getItem('ghosted:settings')
    if (saved) return { ...DEFAULTS, ...JSON.parse(saved) }
  } catch {}
  return { ...DEFAULTS }
}

function save(s: GhostedSettings) {
  localStorage.setItem('ghosted:settings', JSON.stringify(s))
}

interface SettingsStore extends GhostedSettings {
  set: <K extends keyof GhostedSettings>(key: K, value: GhostedSettings[K]) => void
  resetAll: () => void
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  set: (key, value) => {
    set({ [key]: value } as any)
    const state = { ...get() }
    delete (state as any).set
    delete (state as any).resetAll
    save(state as GhostedSettings)
    applyGlobalStyles(state as GhostedSettings)
  },
  resetAll: () => {
    set({ ...DEFAULTS } as any)
    save(DEFAULTS)
    applyGlobalStyles(DEFAULTS)
  },
}))

// Apply CSS variables that need to be global
export function applyGlobalStyles(s: GhostedSettings) {
  const root = document.documentElement
  root.style.setProperty('--accent', s.accentColor)
  root.style.fontSize = `${s.uiFontSize}px`
}

// Apply on load
applyGlobalStyles(load())
