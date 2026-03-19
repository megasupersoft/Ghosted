import React, { useEffect } from 'react'
import { useStore, OpenFile } from '@/store'
import { useSettings } from '@/store/settings'
import { Ghost } from 'lucide-react'

const MonacoEditor = React.lazy(() => import('@monaco-editor/react'))

function getLang(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', md: 'markdown',
    json: 'json', css: 'css', html: 'html', sh: 'shell',
    yaml: 'yaml', yml: 'yaml', toml: 'toml',
  }
  return map[ext] ?? 'plaintext'
}

export function registerGhostTheme(monaco: any) {
  monaco.editor.defineTheme('ghost', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment',  foreground: '7e7e95', fontStyle: 'italic' },
      { token: 'keyword',  foreground: 'b0a8f0' },
      { token: 'keyword.control', foreground: 'b0a8f0' },
      { token: 'string',   foreground: '86efac' },
      { token: 'string.escape', foreground: '4ade80' },
      { token: 'number',   foreground: 'fcd34d' },
      { token: 'type',     foreground: 'd8b4fe' },
      { token: 'type.identifier', foreground: 'd8b4fe' },
      { token: 'function', foreground: 'a5f3fc' },
      { token: 'function.declaration', foreground: '7dd3fc' },
      { token: 'variable', foreground: 'f0f0f5' },
      { token: 'variable.predefined', foreground: 'ababc0' },
      { token: 'identifier', foreground: 'f0f0f5' },
      { token: 'delimiter', foreground: 'ababc0' },
      { token: 'delimiter.bracket', foreground: 'ababc0' },
      { token: 'operator', foreground: 'c8c2f5' },
      { token: 'tag', foreground: 'fb923c' },
      { token: 'attribute.name', foreground: 'b0a8f0' },
      { token: 'attribute.value', foreground: '86efac' },
      { token: 'regexp', foreground: 'fda4af' },
      { token: 'constant', foreground: 'fcd34d' },
      { token: 'annotation', foreground: 'fda4af' },
      { token: 'metatag', foreground: '7e7e95' },
    ],
    colors: {
      'editor.background': '#252532',
      'editor.foreground': '#f0f0f5',
      'editor.lineHighlightBackground': '#2e2e3c',
      'editor.selectionBackground': '#40405a',
      'editorCursor.foreground': '#b0a8f0',
      'editorLineNumber.foreground': '#555568',
      'editorLineNumber.activeForeground': '#ababc0',
      'editorIndentGuide.background1': '#353550',
      'editorIndentGuide.activeBackground1': '#484858',
      'scrollbarSlider.background': '#48485840',
      'scrollbarSlider.hoverBackground': '#55556880',
      'scrollbarSlider.activeBackground': '#6a6a8090',
      'editorOverviewRuler.border': '#00000000',
      'scrollbar.shadow': '#00000000',
    }
  })
}

function localFileUrl(filePath: string): string {
  return `ghosted-file://${encodeURIComponent(filePath)}`
}

function ImageViewer({ file }: { file: OpenFile }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', background: 'var(--bg-surface)', padding: 20 }}>
      <img
        src={localFileUrl(file.path)}
        alt={file.name}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 'var(--radius-md)' }}
        draggable={false}
      />
    </div>
  )
}

function VideoViewer({ file }: { file: OpenFile }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--bg-surface)', padding: 20 }}>
      <video
        src={localFileUrl(file.path)}
        controls
        style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 'var(--radius-md)' }}
      />
    </div>
  )
}

export default function EditorPane({ leafId, filePath }: { leafId?: string; filePath?: string }) {
  const { openFiles, updateFileContent, markFileDirty } = useStore()
  const settings = useSettings()
  const activeFile = filePath ? openFiles.find(f => f.path === filePath) : null

  const handleSave = async () => {
    if (!activeFile) return
    await window.electron.fs.writefile(activeFile.path, activeFile.content)
    markFileDirty(activeFile.path, false)
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [activeFile])

  if (!activeFile) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-ghost)', gap: 24, background: 'var(--bg-surface)', height: '100%' }}>
        <Ghost size={180} color="var(--bg-base)" />
        <span style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--bg-base)' }}>open a file to begin haunting</span>
      </div>
    )
  }

  if (activeFile.fileType === 'image') return <ImageViewer file={activeFile} />
  if (activeFile.fileType === 'video') return <VideoViewer file={activeFile} />

  return (
    <div style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
      <React.Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-ghost)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>summoning editor...</div>}>
        <MonacoEditor
          key={activeFile.path}
          height="100%"
          language={getLang(activeFile.name)}
          value={activeFile.content}
          theme="ghost"
          beforeMount={registerGhostTheme}
          onChange={v => { if (!filePath || v === undefined) return; updateFileContent(filePath, v); markFileDirty(filePath, true) }}
          options={{
            fontSize: settings.editorFontSize,
            fontFamily: settings.editorFontFamily,
            fontLigatures: settings.editorLigatures,
            tabSize: settings.editorTabSize,
            minimap: { enabled: settings.editorMinimap },
            scrollbar: {
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
              verticalSliderSize: 6,
              horizontalSliderSize: 6,
              useShadows: false,
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            scrollBeyondLastLine: false,
            lineNumbers: settings.editorLineNumbers,
            renderLineHighlight: 'gutter',
            bracketPairColorization: { enabled: settings.editorBracketColors },
            padding: { top: 10 },
            smoothScrolling: settings.editorSmoothScrolling,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: settings.editorSmoothCaret ? 'on' : 'off',
            wordWrap: settings.editorWordWrap,
          }}
        />
      </React.Suspense>
    </div>
  )
}
