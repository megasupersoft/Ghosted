import React, { useEffect } from 'react'
import { useStore, OpenFile } from '@/store'
import {
  FileCode, FileText, Braces, Hash, Globe,
  Settings, File, X, Plus, Ghost, Image, Film,
} from 'lucide-react'

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

function TabFileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const sz = 12
  switch (ext) {
    case 'ts': case 'tsx': return <FileCode size={sz} color="var(--accent)" />
    case 'js': case 'jsx': return <FileCode size={sz} color="var(--amber)" />
    case 'py':              return <FileCode size={sz} color="var(--green)" />
    case 'rs':              return <FileCode size={sz} color="var(--red)" />
    case 'go':              return <FileCode size={sz} color="var(--cyan)" />
    case 'md': case 'txt':  return <FileText size={sz} color="var(--text-secondary)" />
    case 'json':            return <Braces size={sz} color="var(--amber)" />
    case 'css': case 'scss': return <Hash size={sz} color="var(--purple)" />
    case 'html':            return <Globe size={sz} color="var(--red)" />
    case 'yaml': case 'yml': case 'toml': return <Settings size={sz} color="var(--text-muted)" />
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp': case 'ico': case 'bmp': case 'avif':
      return <Image size={sz} color="var(--purple)" />
    case 'mp4': case 'webm': case 'mov': case 'avi': case 'mkv': case 'ogg':
      return <Film size={sz} color="var(--cyan)" />
    default:                return <File size={sz} color="var(--text-muted)" />
  }
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
      'editor.background': '#0e0e16',
      'editor.foreground': '#e2e2f0',
      'editor.lineHighlightBackground': '#14141f',
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
    <div
      onClick={() => setActiveFile(file.path)}
      className={`editor-tab ${active ? 'editor-tab-active' : ''}`}
    >
      <TabFileIcon name={file.name} />
      {file.isDirty && <span className="editor-tab-dirty" />}
      <span className="editor-tab-label">{file.name}</span>
      <button
        onClick={e => { e.stopPropagation(); closeFile(file.path) }}
        className="editor-tab-close"
      >
        <X size={12} />
      </button>
    </div>
  )
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

export default function EditorPane({ leafId }: { leafId?: string }) {
  const { openFiles, activeFilePath, updateFileContent, markFileDirty, newUntitledFile } = useStore()
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
      <div className="editor-tab-bar">
        {openFiles.map(f => <Tab key={f.path} file={f} active={f.path === activeFilePath} />)}
        <button onClick={newUntitledFile} className="editor-tab-new" title="New tab">
          <Plus size={14} />
        </button>
      </div>
      {activeFile ? (
        activeFile.fileType === 'image' ? (
          <ImageViewer file={activeFile} />
        ) : activeFile.fileType === 'video' ? (
          <VideoViewer file={activeFile} />
        ) : (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <React.Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-ghost)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>summoning editor...</div>}>
              <MonacoEditor
                key={activeFile.path}
                height="100%"
                language={getLang(activeFile.name)}
                value={activeFile.content}
                theme="ghost"
                beforeMount={registerGhostTheme}
                onChange={v => { if (!activeFilePath || v === undefined) return; updateFileContent(activeFilePath, v); markFileDirty(activeFilePath, true) }}
                options={{
                  fontSize: 14,
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
        )
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-ghost)', gap: 10 }}>
          <Ghost size={36} color="var(--accent)" style={{ opacity: 0.15 }} />
          <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>open a file to begin haunting</span>
        </div>
      )}
    </div>
  )
}
