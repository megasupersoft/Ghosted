import React, { useEffect, useState } from 'react'
import { useStore, OpenFile } from '@/store'
import { useSettings } from '@/store/settings'
import {
  Ghost, Eye, Code, ChevronRight, ChevronDown,
  Braces, Hash, FileText, ToggleLeft, List,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'

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

function getPreviewType(filename: string): 'markdown' | 'json' | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'md' || ext === 'mdx') return 'markdown'
  if (ext === 'json' || ext === 'jsonc' || ext === 'json5') return 'json'
  return null
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="md-preview" style={{
      height: '100%', overflow: 'auto', padding: '24px 32px',
      background: 'var(--bg-surface)', color: 'var(--text-primary)',
      fontFamily: 'var(--font-ui)', fontSize: 15, lineHeight: 1.7,
    }}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}

function jsonIcon(value: any): React.ReactNode {
  const s = { flexShrink: 0 } as const
  if (value === null) return <Hash size={16} color="var(--text-muted)" style={s} />
  if (typeof value === 'string') return <FileText size={16} color="var(--green)" style={s} />
  if (typeof value === 'number') return <Hash size={16} color="var(--amber)" style={s} />
  if (typeof value === 'boolean') return <ToggleLeft size={16} color="var(--amber)" style={s} />
  if (Array.isArray(value)) return <List size={16} color="var(--cyan)" style={s} />
  return <Braces size={16} color="var(--accent)" style={s} />
}

function jsonValueText(value: any): React.ReactNode {
  if (value === null) return <span style={{ color: 'var(--text-muted)' }}>null</span>
  if (typeof value === 'boolean') return <span style={{ color: 'var(--amber)' }}>{String(value)}</span>
  if (typeof value === 'number') return <span style={{ color: 'var(--amber)' }}>{value}</span>
  if (typeof value === 'string') {
    const display = value.length > 80 ? value.slice(0, 80) + '...' : value
    return <span style={{ color: 'var(--green)' }}>{display}</span>
  }
  return null
}

function JsonNode({ label, value, depth, defaultOpen }: {
  label: string; value: any; depth: number; defaultOpen?: boolean
}) {
  const isExpandable = value !== null && typeof value === 'object'
  const [open, setOpen] = useState(defaultOpen ?? depth < 2)

  const isArray = Array.isArray(value)
  const entries: [string, any][] = isExpandable
    ? (isArray ? value.map((v: any, i: number) => [String(i), v]) : Object.entries(value))
    : []
  const count = entries.length

  return (
    <>
      <div
        className="filetree-row"
        onClick={() => isExpandable && setOpen(o => !o)}
        style={{ paddingLeft: 6 + depth * 20, cursor: isExpandable ? 'pointer' : 'default' }}
      >
        <span className="filetree-content">
          {isExpandable ? (
            open
              ? <ChevronDown size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
              : <ChevronRight size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
          ) : (
            <span style={{ width: 16, flexShrink: 0 }} />
          )}
          {jsonIcon(value)}
          <span className="filetree-name" style={{ color: 'var(--text-primary)' }}>{label}</span>
          {!isExpandable && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginLeft: 4 }}>
              {jsonValueText(value)}
            </span>
          )}
          {isExpandable && (
            <span style={{ color: 'var(--text-ghost)', fontSize: 11, marginLeft: 4 }}>
              {isArray ? `[${count}]` : `{${count}}`}
            </span>
          )}
        </span>
      </div>
      {open && entries.map(([key, val]) => (
        <JsonNode key={key} label={key} value={val} depth={depth + 1} />
      ))}
    </>
  )
}

function JsonPreview({ content }: { content: string }) {
  let parsed: any
  let error = ''
  try { parsed = JSON.parse(content) } catch (e: any) { error = e.message }

  return (
    <div style={{
      height: '100%', overflow: 'auto', padding: '4px 0',
      background: 'var(--bg-surface)',
    }}>
      {error ? (
        <div style={{ padding: 16, color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          Invalid JSON: {error}
        </div>
      ) : (
        <JsonNode label="root" value={parsed} depth={0} defaultOpen />
      )}
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
  const [showPreview, setShowPreview] = useState(false)

  const previewType = activeFile ? getPreviewType(activeFile.name) : null

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Preview toggle button */}
      {previewType && (
        <button
          onClick={() => setShowPreview(p => !p)}
          title={showPreview ? 'Show source' : 'Show preview'}
          style={{
            position: 'absolute', top: 8, right: 16, zIndex: 10,
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', color: 'var(--text-secondary)',
            cursor: 'pointer', transition: 'color 0.15s, background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-bright)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          {showPreview ? <Code size={16} /> : <Eye size={16} />}
        </button>
      )}

      {/* Preview or editor */}
      {showPreview && previewType === 'markdown' ? (
        <MarkdownPreview content={activeFile.content} />
      ) : showPreview && previewType === 'json' ? (
        <JsonPreview content={activeFile.content} />
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
      )}
    </div>
  )
}
