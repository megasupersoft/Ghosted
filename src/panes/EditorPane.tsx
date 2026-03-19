import React, { useEffect } from 'react'
import { useStore, OpenFile } from '@/store'
import { useSettings } from '@/store/settings'
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
      'editor.background': '#252532',
      'editor.foreground': '#f0f0f5',
      'editor.lineHighlightBackground': '#2e2e3c',
      'editor.selectionBackground': '#40405a',
      'editorCursor.foreground': '#b0a8f0',
      'editorLineNumber.foreground': '#555568',
      'editorLineNumber.activeForeground': '#ababc0',
      'editorIndentGuide.background1': '#353550',
      'editorIndentGuide.activeBackground1': '#484858',
      'scrollbarSlider.background': '#48485880',
      'scrollbarSlider.hoverBackground': '#555568',
    }
  })
}

function Tab({ file, active, leafId }: { file: { path: string; name: string; isDirty: boolean }; active: boolean; leafId?: string }) {
  const { setActiveFile, closeFile } = useStore()
  return (
    <div
      onClick={() => setActiveFile(file.path, leafId)}
      className={`editor-tab ${active ? 'editor-tab-active' : ''}`}
    >
      <TabFileIcon name={file.name} />
      {file.isDirty && <span className="editor-tab-dirty" />}
      <span className="editor-tab-label">{file.name}</span>
      <button
        onClick={e => { e.stopPropagation(); closeFile(file.path, leafId) }}
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
