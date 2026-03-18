import React, { useEffect } from 'react'
import { useStore } from '@/store'

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
      { token: 'comment',  foreground: '2a2a55', fontStyle: 'italic' },
      { token: 'keyword',  foreground: '8b7cf8' },
      { token: 'string',   foreground: '4ade80' },
      { token: 'number',   foreground: 'fbbf24' },
      { token: 'type',     foreground: 'c084fc' },
      { token: 'function', foreground: '67e8f9' },
    ],
    colors: {
      'editor.background': '#09090e',
      'editor.foreground': '#e2e2f0',
      'editor.lineHighlightBackground': '#0e0e16',
      'editor.selectionBackground': '#1e1e35',
      'editorCursor.foreground': '#8b7cf8',
      'editorLineNumber.foreground': '#2a2a45',
      'editorLineNumber.activeForeground': '#7878a0',
      'editorIndentGuide.background1': '#1e1e2e',
      'editorIndentGuide.activeBackground1': '#28283c',
      'scrollbarSlider.background': '#1e1e2e80',
      'scrollbarSlider.hoverBackground': '#28283c',
    }
  })
}

function Tab({ file, active }: { file: { path: string; name: string; isDirty: boolean }; active: boolean }) {
  const { setActiveFile, closeFile } = useStore()
  return (
    <div onClick={() => setActiveFile(file.path)} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      height: 'var(--tab-h)', padding: '0 12px',
      background: active ? 'var(--bg-base)' : 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      borderBottom: active ? '1px solid var(--bg-base)' : '1px solid var(--border)',
      borderTop: active ? '1px solid var(--accent)' : '1px solid transparent',
      cursor: 'pointer', fontSize: 12, flexShrink: 0, userSelect: 'none',
      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
      transition: 'all 0.1s',
    }}>
      {file.isDirty && <span style={{ color: 'var(--accent)', fontSize: 7 }}>●</span>}
      <span>{file.name}</span>
      <button onClick={e => { e.stopPropagation(); closeFile(file.path) }}
        style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: '0 2px', borderRadius: 3 }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
      >×</button>
    </div>
  )
}

export default function EditorPane() {
  const { openFiles, activeFilePath, updateFileContent, markFileDirty } = useStore()
  const activeFile = openFiles.find(f => f.path === activeFilePath)

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        {openFiles.map(f => <Tab key={f.path} file={f} active={f.path === activeFilePath} />)}
      </div>
      {activeFile ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <React.Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-ghost)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>summoning editor…</div>}>
            <MonacoEditor
              key={activeFile.path}
              height="100%"
              language={getLang(activeFile.name)}
              value={activeFile.content}
              theme="ghost"
              beforeMount={registerGhostTheme}
              onChange={v => { if (!activeFilePath || v === undefined) return; updateFileContent(activeFilePath, v); markFileDirty(activeFilePath, true) }}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                renderLineHighlight: 'gutter',
                bracketPairColorization: { enabled: true },
                padding: { top: 10 },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                wordWrap: 'on',
              }}
            />
          </React.Suspense>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-ghost)', gap: 10 }}>
          <span style={{ fontSize: 36, opacity: 0.15 }}>👻</span>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>open a file to begin haunting</span>
        </div>
      )}
    </div>
  )
}
