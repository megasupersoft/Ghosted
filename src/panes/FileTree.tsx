import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useStore, getEditorLeafId } from '@/store'
import { findFirstLeafByPane } from '@/store/layout'
import { useSettings } from '@/store/settings'
import {
  Folder, FolderOpen, ChevronRight, ChevronDown,
  FileCode, FileText, File, FileImage,
  FileType, Braces, Settings, Hash, Globe,
  FolderSearch, Workflow, FilePlus, FolderPlus,
  Trash2, Pencil, Copy, FolderOpen as RevealIcon,
  FileJson, FileVideo, FileAudio, FileArchive,
  Lock, Database, Terminal, Shield, Cog,
  FileCheck, Package, Scroll, Image, Music, Undo2,
} from 'lucide-react'

interface FileNode { id: string; name: string; path: string; isDirectory: boolean }

const ICON_SIZE = 20

// ─── File icon by extension ──────────────────────────────────────────────────

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const s = { flexShrink: 0 } as const

  // Special filenames
  const lower = name.toLowerCase()
  if (lower === 'package.json') return <Package size={ICON_SIZE} color="var(--green)" style={s} />
  if (lower === 'tsconfig.json' || lower.startsWith('tsconfig.')) return <Cog size={ICON_SIZE} color="var(--accent)" style={s} />
  if (lower === '.gitignore' || lower === '.gitattributes') return <FileCheck size={ICON_SIZE} color="var(--orange)" style={s} />
  if (lower === 'dockerfile' || lower === 'docker-compose.yml') return <Package size={ICON_SIZE} color="var(--sky)" style={s} />
  if (lower === 'license' || lower === 'license.md') return <Scroll size={ICON_SIZE} color="var(--amber)" style={s} />
  if (lower === '.env' || lower.startsWith('.env.')) return <Lock size={ICON_SIZE} color="var(--amber)" style={s} />

  switch (ext) {
    // TypeScript
    case 'ts':
      return <FileCode size={ICON_SIZE} color="var(--accent)" style={s} />
    case 'tsx':
      return <FileCode size={ICON_SIZE} color="var(--accent-bright)" style={s} />

    // JavaScript
    case 'js':
      return <FileCode size={ICON_SIZE} color="var(--amber)" style={s} />
    case 'jsx':
      return <FileCode size={ICON_SIZE} color="var(--orange)" style={s} />
    case 'mjs': case 'cjs':
      return <FileCode size={ICON_SIZE} color="var(--amber)" style={s} />

    // Python
    case 'py': case 'pyw':
      return <FileCode size={ICON_SIZE} color="var(--teal)" style={s} />
    case 'ipynb':
      return <FileCode size={ICON_SIZE} color="var(--orange)" style={s} />

    // Systems languages
    case 'rs':
      return <FileCode size={ICON_SIZE} color="var(--orange)" style={s} />
    case 'go':
      return <FileCode size={ICON_SIZE} color="var(--cyan)" style={s} />
    case 'c': case 'h':
      return <FileCode size={ICON_SIZE} color="var(--blue)" style={s} />
    case 'cpp': case 'cc': case 'cxx': case 'hpp':
      return <FileCode size={ICON_SIZE} color="var(--blue)" style={s} />
    case 'java':
      return <FileCode size={ICON_SIZE} color="var(--red)" style={s} />
    case 'kt': case 'kts':
      return <FileCode size={ICON_SIZE} color="var(--purple)" style={s} />
    case 'swift':
      return <FileCode size={ICON_SIZE} color="var(--orange)" style={s} />
    case 'cs':
      return <FileCode size={ICON_SIZE} color="var(--green)" style={s} />

    // Web languages
    case 'html': case 'htm':
      return <Globe size={ICON_SIZE} color="var(--orange)" style={s} />
    case 'css':
      return <Hash size={ICON_SIZE} color="var(--sky)" style={s} />
    case 'scss': case 'sass':
      return <Hash size={ICON_SIZE} color="var(--pink)" style={s} />
    case 'less':
      return <Hash size={ICON_SIZE} color="var(--blue)" style={s} />
    case 'vue':
      return <FileCode size={ICON_SIZE} color="var(--green)" style={s} />
    case 'svelte':
      return <FileCode size={ICON_SIZE} color="var(--orange)" style={s} />

    // Scripting
    case 'rb':
      return <FileCode size={ICON_SIZE} color="var(--red)" style={s} />
    case 'php':
      return <FileCode size={ICON_SIZE} color="var(--purple)" style={s} />
    case 'lua':
      return <FileCode size={ICON_SIZE} color="var(--blue)" style={s} />
    case 'sh': case 'bash': case 'zsh': case 'fish':
      return <Terminal size={ICON_SIZE} color="var(--green)" style={s} />
    case 'ps1': case 'bat': case 'cmd':
      return <Terminal size={ICON_SIZE} color="var(--sky)" style={s} />

    // Data / config
    case 'json': case 'jsonc': case 'json5':
      return <Braces size={ICON_SIZE} color="var(--amber)" style={s} />
    case 'yaml': case 'yml':
      return <Settings size={ICON_SIZE} color="var(--rose)" style={s} />
    case 'toml':
      return <Settings size={ICON_SIZE} color="var(--orange)" style={s} />
    case 'ini': case 'cfg': case 'conf':
      return <Settings size={ICON_SIZE} color="var(--text-secondary)" style={s} />
    case 'xml': case 'plist':
      return <FileCode size={ICON_SIZE} color="var(--teal)" style={s} />
    case 'csv': case 'tsv':
      return <Database size={ICON_SIZE} color="var(--green)" style={s} />
    case 'sql':
      return <Database size={ICON_SIZE} color="var(--sky)" style={s} />
    case 'graphql': case 'gql':
      return <FileCode size={ICON_SIZE} color="var(--pink)" style={s} />
    case 'prisma':
      return <Database size={ICON_SIZE} color="var(--purple)" style={s} />
    case 'env':
      return <Lock size={ICON_SIZE} color="var(--amber)" style={s} />

    // Markdown / docs
    case 'md': case 'mdx':
      return <FileText size={ICON_SIZE} color="var(--sky)" style={s} />
    case 'txt': case 'log':
      return <FileText size={ICON_SIZE} color="var(--text-secondary)" style={s} />
    case 'pdf':
      return <FileText size={ICON_SIZE} color="var(--red)" style={s} />
    case 'doc': case 'docx':
      return <FileText size={ICON_SIZE} color="var(--blue)" style={s} />

    // Canvas / workflow
    case 'canvas':
      return <Workflow size={ICON_SIZE} color="var(--accent)" style={s} />

    // Images
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'avif': case 'bmp': case 'ico':
      return <Image size={ICON_SIZE} color="var(--purple)" style={s} />
    case 'svg':
      return <Image size={ICON_SIZE} color="var(--amber)" style={s} />

    // Video
    case 'mp4': case 'webm': case 'mov': case 'avi': case 'mkv': case 'ogg':
      return <FileVideo size={ICON_SIZE} color="var(--pink)" style={s} />

    // Audio
    case 'mp3': case 'wav': case 'flac': case 'aac': case 'm4a':
      return <Music size={ICON_SIZE} color="var(--teal)" style={s} />

    // Archives
    case 'zip': case 'tar': case 'gz': case 'bz2': case '7z': case 'rar': case 'xz':
      return <FileArchive size={ICON_SIZE} color="var(--orange)" style={s} />

    // Lock files
    case 'lock':
      return <Lock size={ICON_SIZE} color="var(--text-muted)" style={s} />

    // Security / certs
    case 'pem': case 'key': case 'crt': case 'cer':
      return <Shield size={ICON_SIZE} color="var(--red)" style={s} />

    // Binary / compiled
    case 'wasm':
      return <FileCode size={ICON_SIZE} color="var(--purple)" style={s} />
    case 'node': case 'so': case 'dylib': case 'dll':
      return <Package size={ICON_SIZE} color="var(--text-muted)" style={s} />

    default:
      return <File size={ICON_SIZE} color="var(--text-muted)" style={s} />
  }
}

// ─── Sort helper ──────────────────────────────────────────────────────────────

function sortEntries(entries: { name: string; path: string; isDirectory: boolean }[], showHidden: boolean): FileNode[] {
  return entries
    .filter(e => showHidden || !e.name.startsWith('.'))
    .sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name))
    .map(e => ({ id: e.path, name: e.name, path: e.path, isDirectory: e.isDirectory }))
}

// ─── Inline input (for new file/folder and rename) ───────────────────────────

function InlineInput({
  defaultValue, icon, depth, onSubmit, onCancel,
}: {
  defaultValue: string
  icon: React.ReactNode
  depth: number
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = ref.current
    if (!input) return
    input.focus()
    // Select the name part before extension for rename
    const dotIndex = defaultValue.lastIndexOf('.')
    if (dotIndex > 0) {
      input.setSelectionRange(0, dotIndex)
    } else {
      input.select()
    }
  }, [])

  const submit = () => {
    const val = ref.current?.value.trim()
    if (val && val !== defaultValue) onSubmit(val)
    else onCancel()
  }

  return (
    <div className="filetree-row" style={{ paddingLeft: 6 + depth * 14 }}>
      <span style={{ width: 12, flexShrink: 0 }} />
      {icon}
      <input
        ref={ref}
        defaultValue={defaultValue}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onCancel()
          e.stopPropagation()
        }}
        onBlur={submit}
        style={{
          flex: 1, minWidth: 0,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--accent)',
          borderRadius: 3,
          color: 'var(--text-primary)',
          fontSize: 13,
          padding: '1px 5px',
          outline: 'none',
          fontFamily: 'var(--font-ui)',
        }}
      />
    </div>
  )
}

// ─── Context menu ─────────────────────────────────────────────────────────────

interface ContextMenuProps {
  x: number; y: number
  node: FileNode | null  // null = root-level context
  onNewFile: () => void
  onNewFolder: () => void
  onRename: () => void
  onDelete: () => void
  onUndo: () => void
  canUndo: boolean
  onCopyPath: () => void
  onCopyRelativePath: () => void
  onRevealInFileManager: () => void
  onClose: () => void
}

function ContextMenu({ x, y, node, onNewFile, onNewFolder, onRename, onDelete, onUndo, canUndo, onCopyPath, onCopyRelativePath, onRevealInFileManager, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Clamp to viewport
  const menuStyle: React.CSSProperties = {
    position: 'fixed', left: x, top: y, zIndex: 1000,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)',
    borderRadius: 'var(--radius-md)', padding: 4, minWidth: 180,
    boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
  }

  const itemClass = 'filetree-ctx-item'

  return (
    <div ref={ref} style={menuStyle}>
      <button className={itemClass} onClick={() => { onNewFile(); onClose() }}>
        <FilePlus size={13} /> New File
      </button>
      <button className={itemClass} onClick={() => { onNewFolder(); onClose() }}>
        <FolderPlus size={13} /> New Folder
      </button>
      {canUndo && (
        <>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />
          <button className={itemClass} onClick={() => { onUndo(); onClose() }}>
            <Undo2 size={13} /> Undo
          </button>
        </>
      )}
      {node && (
        <>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />
          <button className={itemClass} onClick={() => { onRename(); onClose() }}>
            <Pencil size={13} /> Rename
          </button>
          <button className={itemClass} style={{ color: 'var(--red)' }} onClick={() => { onDelete(); onClose() }}>
            <Trash2 size={13} /> Delete
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />
          <button className={itemClass} onClick={() => { onCopyPath(); onClose() }}>
            <Copy size={13} /> Copy Path
          </button>
          <button className={itemClass} onClick={() => { onCopyRelativePath(); onClose() }}>
            <Copy size={13} /> Copy Relative Path
          </button>
          <button className={itemClass} onClick={() => { onRevealInFileManager(); onClose() }}>
            <RevealIcon size={13} /> Reveal in File Manager
          </button>
        </>
      )}
    </div>
  )
}

// ─── File row ─────────────────────────────────────────────────────────────────

interface FileRowProps {
  node: FileNode
  depth: number
  onOpen: (n: FileNode) => void
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
  selectedPath: string | null
  onSelect: (path: string) => void
  renamingPath: string | null
  onRenameSubmit: (oldPath: string, newName: string) => void
  onRenameCancel: () => void
  onStartRename: (path: string) => void
  onMoveFile: (srcPath: string, destDir: string) => void
  onExternalDrop: (files: File[], destDir: string) => void
  creatingIn: string | null
  creatingType: 'file' | 'folder' | null
  onCreateSubmit: (parentPath: string, name: string) => void
  onCreateCancel: () => void
  refreshKey: number
  ancestorPaths?: string[]
  activeAtDepth?: boolean[]
}

function FileRow({
  node, depth, onOpen, onContextMenu, selectedPath, onSelect,
  renamingPath, onRenameSubmit, onRenameCancel, onStartRename, onMoveFile, onExternalDrop,
  creatingIn, creatingType, onCreateSubmit, onCreateCancel,
  refreshKey, ancestorPaths = [], activeAtDepth = [],
}: FileRowProps) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<FileNode[]>([])
  const [dropOver, setDropOver] = useState(false)
  const showHidden = useSettings(s => s.showHiddenFiles)

  const loadChildren = useCallback(async () => {
    if (!node.isDirectory) return
    try {
      const entries = await window.electron.fs.readdir(node.path)
      setChildren(sortEntries(entries, showHidden))
    } catch {}
  }, [node.path, node.isDirectory, showHidden])

  // Refresh children when refreshKey changes (file watcher triggered)
  useEffect(() => {
    if (open && node.isDirectory) loadChildren()
  }, [refreshKey, open, loadChildren])

  const toggle = async () => {
    if (!node.isDirectory) { onOpen(node); return }
    if (!open) await loadChildren()
    setOpen(o => !o)
  }

  const isSelected = selectedPath === node.path
  const isOnSelectedPath = !!(selectedPath && (selectedPath === node.path || selectedPath.startsWith(node.path + '/')))
  const isRenaming = renamingPath === node.path
  const isCreatingHere = creatingIn === node.path && node.isDirectory

  // If creating here, auto-expand
  useEffect(() => {
    if (isCreatingHere && !open) {
      loadChildren().then(() => setOpen(true))
    }
  }, [isCreatingHere])

  if (isRenaming) {
    return (
      <InlineInput
        defaultValue={node.name}
        icon={node.isDirectory
          ? <FolderOpen size={ICON_SIZE} color="var(--accent)" style={{ flexShrink: 0 }} />
          : <FileIcon name={node.name} />
        }
        depth={depth}
        onSubmit={(newName) => onRenameSubmit(node.path, newName)}
        onCancel={onRenameCancel}
      />
    )
  }

  return (
    <>
      <div
        onClick={() => { onSelect(node.path); toggle() }}
        onDoubleClick={e => { e.stopPropagation(); onStartRename(node.path) }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onSelect(node.path); onContextMenu(e, node) }}
        draggable
        onDragStart={e => {
          e.dataTransfer.effectAllowed = 'copyMove'
          e.dataTransfer.setData('application/ghosted-file', JSON.stringify({ path: node.path, name: node.name }))
          e.dataTransfer.setData('application/ghosted-explorer-move', node.path)
          // Allow dragging to external apps (Finder, etc.)
          e.dataTransfer.setData('text/uri-list', `file://${encodeURI(node.path)}`)
          e.dataTransfer.setData('text/plain', node.path)
        }}
        onDragOver={e => {
          if (!node.isDirectory) return
          // Accept internal explorer moves
          if (e.dataTransfer.types.includes('application/ghosted-explorer-move')) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDropOver(true)
            return
          }
          // Accept native file drops from OS
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            setDropOver(true)
          }
        }}
        onDragLeave={() => setDropOver(false)}
        onDrop={e => {
          setDropOver(false)
          if (!node.isDirectory) return

          // Internal explorer move
          const srcPath = e.dataTransfer.getData('application/ghosted-explorer-move')
          if (srcPath) {
            if (srcPath === node.path || srcPath.startsWith(node.path + '/')) return
            e.preventDefault()
            e.stopPropagation()
            onMoveFile(srcPath, node.path)
            return
          }

          // Native file drop from OS (Finder, etc.)
          if (e.dataTransfer.files.length > 0) {
            e.preventDefault()
            e.stopPropagation()
            onExternalDrop(Array.from(e.dataTransfer.files), node.path)
          }
        }}
        className="filetree-row"
        style={{
          paddingLeft: 6 + depth * 38,
          position: 'relative',
          ...(dropOver ? { background: 'var(--accent-dim)' } : {}),
        }}
      >
        {/* Tree guide lines */}
        {depth > 0 && (() => {
          const guideX = (i: number) => 6 + i * 28 + 25
          return (
            <>
              {ancestorPaths.map((_, i) => {
                const active = activeAtDepth[i] ?? false
                // Truncate bright line at midpoint if this guide terminates here
                const terminatesHere = active && i === depth - 1 && isOnSelectedPath
                return (
                  <React.Fragment key={i}>
                    {/* Dim structural line — always full height */}
                    <span style={{
                      position: 'absolute', left: guideX(i), top: 0, bottom: 0, width: 2,
                      background: 'var(--accent)', opacity: 0.08,
                      pointerEvents: 'none',
                    }} />
                    {/* Bright overlay — truncated if terminating here */}
                    {active && (
                      <span style={{
                        position: 'absolute', left: guideX(i), top: 0, bottom: terminatesHere ? '50%' : 0, width: 2,
                        background: 'var(--accent)', opacity: 0.2,
                        pointerEvents: 'none',
                      }} />
                    )}
                  </React.Fragment>
                )
              })}
              {/* Bright line at current depth — only for the selected item, stops at midpoint */}
              {isSelected && (
                <>
                  <span style={{
                    position: 'absolute', left: guideX(depth - 1), top: 0, bottom: '50%', width: 2,
                    background: 'var(--accent)', opacity: 0.2, pointerEvents: 'none',
                  }} />
                  {/* Horizontal connector to the selected item */}
                  <span style={{
                    position: 'absolute',
                    left: guideX(depth - 1),
                    top: '50%',
                    width: 10,
                    height: 2,
                    background: 'var(--accent)', opacity: 0.2, pointerEvents: 'none',
                  }} />
                </>
              )}
              {/* Horizontal connector: on ancestor directories, bridges parent's ending line to child's line */}
              {isOnSelectedPath && !isSelected && depth >= 1 && (
                <span style={{
                  position: 'absolute',
                  left: guideX(depth - 1),
                  top: '50%',
                  width: 10,
                  height: 2,
                  background: 'var(--accent)', opacity: 0.2, pointerEvents: 'none',
                }} />
              )}
            </>
          )
        })()}
        <span className="filetree-content" style={{ background: isSelected ? 'var(--bg-selection)' : undefined }}>
          {node.isDirectory ? (
            <>
              {open
                ? <ChevronDown size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
                : <ChevronRight size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
              }
              {open
                ? <FolderOpen size={ICON_SIZE} color="var(--accent-bright)" style={{ flexShrink: 0 }} />
                : <Folder size={ICON_SIZE} color="var(--accent-bright)" style={{ flexShrink: 0 }} />
              }
            </>
          ) : (
            <FileIcon name={node.name} />
          )}
          <span className="filetree-name" style={{ color: node.isDirectory ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            {node.name}
          </span>
        </span>
      </div>

      {/* Inline create input — shown at top of expanded folder */}
      {open && isCreatingHere && creatingType && (
        <InlineInput
          defaultValue=""
          icon={creatingType === 'folder'
            ? <Folder size={ICON_SIZE} color="var(--accent)" style={{ flexShrink: 0 }} />
            : <File size={ICON_SIZE} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          }
          depth={depth + 1}
          onSubmit={(name) => onCreateSubmit(node.path, name)}
          onCancel={onCreateCancel}
        />
      )}

      {open && (() => {
        const childAncestors = [...ancestorPaths, node.path]
        // Find which child is on the path to the selected item
        const selectedChildIdx = selectedPath
          ? children.findIndex(c => selectedPath === c.path || (c.isDirectory && selectedPath.startsWith(c.path + '/')))
          : -1
        return children.map((c, idx) => {
          // This child is at or above the selected-path sibling
          const thisDepthActive = selectedChildIdx >= 0 && idx <= selectedChildIdx
          // Ancestor depths: if this node is on the selected path (an ancestor dir),
          // its parent's line already terminated with a horizontal connector on this row,
          // so turn off the parent's depth inside this subtree
          const childActive = [
            ...activeAtDepth.map((a, i) => a && !(isOnSelectedPath && i === depth - 1)),
            thisDepthActive,
          ]
          return (
            <FileRow
              key={c.id} node={c} depth={depth + 1} onOpen={onOpen}
              onContextMenu={onContextMenu} selectedPath={selectedPath} onSelect={onSelect}
              renamingPath={renamingPath} onRenameSubmit={onRenameSubmit} onRenameCancel={onRenameCancel} onStartRename={onStartRename}
              onMoveFile={onMoveFile} onExternalDrop={onExternalDrop}
              creatingIn={creatingIn} creatingType={creatingType}
              onCreateSubmit={onCreateSubmit} onCreateCancel={onCreateCancel}
              refreshKey={refreshKey}
              ancestorPaths={childAncestors}
              activeAtDepth={childActive}
            />
          )
        })
      })()}
    </>
  )
}

// ─── Main FileTree ────────────────────────────────────────────────────────────

export default function FileTree() {
  const { workspacePath, setWorkspacePath, openFile, setFocusedLeaf, focusedLeafId } = useStore()
  const showHidden = useSettings(s => s.showHiddenFiles)
  const [roots, setRoots] = useState<FileNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // ── Filesystem undo stack ───────────────────────────────────────────────
  type FsAction =
    | { type: 'create'; path: string; isDirectory: boolean }
    | { type: 'delete'; path: string; isDirectory: boolean; content?: string }
    | { type: 'rename'; oldPath: string; newPath: string }

  const undoStack = useRef<FsAction[]>([])
  const MAX_UNDO = 30

  const pushUndo = (action: FsAction) => {
    undoStack.current.push(action)
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
  }

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null)

  // Inline create state
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null)

  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)


  const loadDir = useCallback(async (p: string) => {
    try {
      const entries = await window.electron.fs.readdir(p)
      setRoots(sortEntries(entries, showHidden))
    } catch {}
  }, [showHidden])

  const openWorkspace = async () => {
    const chosen = await window.electron.dialog.openFolder()
    if (!chosen) return
    setWorkspacePath(chosen)
    loadDir(chosen)
  }

  useEffect(() => { if (workspacePath) loadDir(workspacePath) }, [workspacePath, loadDir])

  const refresh = useCallback(() => {
    if (workspacePath) loadDir(workspacePath)
    setRefreshKey(k => k + 1)
  }, [workspacePath, loadDir])

  const handleUndo = useCallback(async () => {
    const action = undoStack.current.pop()
    if (!action) return
    try {
      switch (action.type) {
        case 'create':
          await window.electron.fs.delete(action.path)
          break
        case 'delete':
          if (action.isDirectory) {
            await window.electron.fs.mkdir(action.path)
          } else {
            await window.electron.fs.newfile(action.path, action.content ?? '')
          }
          break
        case 'rename':
          await window.electron.fs.rename(action.newPath, action.oldPath)
          break
      }
      refresh()
    } catch {}
  }, [refresh])

  // ─── File watcher ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspacePath) return
    window.electron.fs.watch(workspacePath)

    let debounce: ReturnType<typeof setTimeout>
    const handler = window.electron.fs.onChanged(() => {
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        loadDir(workspacePath)
        setRefreshKey(k => k + 1)
      }, 200)
    })

    return () => {
      window.electron.fs.offChanged(handler)
      clearTimeout(debounce)
    }
  }, [workspacePath, loadDir])

  // ─── File open handler ──────────────────────────────────────────────────────
  const handleOpen = useCallback(async (node: FileNode) => {
    try {
      const ext = node.name.split('.').pop()?.toLowerCase() ?? ''
      const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']
      const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogg']

      let content = ''
      let fileType: 'text' | 'image' | 'video' | 'canvas' = 'text'

      if (ext === 'canvas') {
        content = await window.electron.fs.readfile(node.path).catch(() => '{}')
        fileType = 'canvas'
      } else if (IMAGE_EXTS.includes(ext)) {
        fileType = 'image'
      } else if (VIDEO_EXTS.includes(ext)) {
        fileType = 'video'
      } else {
        content = await window.electron.fs.readfile(node.path)
      }

      openFile(node.path, node.name, content, fileType)
    } catch {}
  }, [openFile])

  // ─── CRUD operations ───────────────────────────────────────────────────────

  // ── Clipboard (copy/cut/paste) ─────────────────────────────────────────────
  const [clipboard, setClipboard] = useState<{ path: string; cut: boolean } | null>(null)

  // ── Move file (drag-drop or cut-paste) ────────────────────────────────────
  const handleExternalDrop = useCallback(async (files: File[], destDir: string) => {
    for (const file of files) {
      const filePath = (file as any).path as string | undefined
      if (!filePath) continue
      const name = filePath.split('/').pop() ?? ''
      const dest = `${destDir}/${name}`
      try {
        await window.electron.fs.copy(filePath, dest)
        pushUndo({ type: 'create', path: dest, isDirectory: false })
      } catch {}
    }
    refresh()
  }, [refresh])

  const handleMoveFile = useCallback(async (srcPath: string, destDir: string) => {
    const name = srcPath.split('/').pop() ?? ''
    const newPath = `${destDir}/${name}`
    if (srcPath === newPath) return
    try {
      await window.electron.fs.rename(srcPath, newPath)
      pushUndo({ type: 'rename', oldPath: srcPath, newPath })
      refresh()
    } catch {}
  }, [refresh])

  const handlePaste = useCallback(async () => {
    if (!clipboard || !selectedPath) return
    const destDir = getParentDir(selectedPath)
    const name = clipboard.path.split('/').pop() ?? ''
    const destPath = `${destDir}/${name}`

    if (clipboard.cut) {
      // Move
      if (clipboard.path === destPath) return
      try {
        await window.electron.fs.rename(clipboard.path, destPath)
        pushUndo({ type: 'rename', oldPath: clipboard.path, newPath: destPath })
        refresh()
      } catch {}
      setClipboard(null)
    } else {
      // Copy — read content and write to new location
      try {
        const stat = await window.electron.fs.stat(clipboard.path)
        if (stat?.isDirectory) {
          // Can't copy directories yet — would need recursive copy
          return
        }
        const content = await window.electron.fs.readfile(clipboard.path)
        // Avoid overwriting — add " copy" suffix if target exists
        let finalPath = destPath
        const exists = await window.electron.fs.exists(destPath)
        if (exists) {
          const dot = name.lastIndexOf('.')
          const base = dot > 0 ? name.slice(0, dot) : name
          const ext = dot > 0 ? name.slice(dot) : ''
          finalPath = `${destDir}/${base} copy${ext}`
        }
        await window.electron.fs.newfile(finalPath, content)
        pushUndo({ type: 'create', path: finalPath, isDirectory: false })
        refresh()
      } catch {}
    }
  }, [clipboard, selectedPath, refresh])

  const getParentDir = (nodePath: string | null): string => {
    if (!nodePath) return workspacePath ?? ''
    // Check if selected node is a directory
    const node = findNodeByPath(roots, nodePath)
    if (node?.isDirectory) return node.path
    // Otherwise use parent directory
    const lastSlash = nodePath.lastIndexOf('/')
    return lastSlash > 0 ? nodePath.slice(0, lastSlash) : workspacePath ?? ''
  }

  const findNodeByPath = (nodes: FileNode[], targetPath: string): FileNode | null => {
    for (const n of nodes) {
      if (n.path === targetPath) return n
    }
    return null
  }

  const startCreate = (type: 'file' | 'folder') => {
    const parentDir = ctxMenu?.node
      ? (ctxMenu.node.isDirectory ? ctxMenu.node.path : ctxMenu.node.path.slice(0, ctxMenu.node.path.lastIndexOf('/')))
      : (selectedPath ? getParentDir(selectedPath) : workspacePath)
    setCreatingIn(parentDir ?? workspacePath)
    setCreatingType(type)
  }

  const handleCreateSubmit = async (parentPath: string, name: string) => {
    try {
      const fullPath = `${parentPath}/${name}`
      const isDir = creatingType === 'folder'
      if (isDir) {
        await window.electron.fs.mkdir(fullPath)
      } else {
        await window.electron.fs.newfile(fullPath)
      }
      pushUndo({ type: 'create', path: fullPath, isDirectory: isDir })
      refresh()
    } catch {}
    setCreatingIn(null)
    setCreatingType(null)
  }

  const handleRenameSubmit = async (oldPath: string, newName: string) => {
    try {
      const parentDir = oldPath.slice(0, oldPath.lastIndexOf('/'))
      const newPath = `${parentDir}/${newName}`
      await window.electron.fs.rename(oldPath, newPath)
      pushUndo({ type: 'rename', oldPath, newPath })
      refresh()
    } catch {}
    setRenamingPath(null)
  }

  const deleteNode = useCallback(async (node: FileNode) => {
    try {
      let content: string | undefined
      if (!node.isDirectory) {
        try { content = await window.electron.fs.readfile(node.path) } catch {}
      }
      await window.electron.fs.delete(node.path)
      pushUndo({ type: 'delete', path: node.path, isDirectory: node.isDirectory, content })
      refresh()
    } catch {}
  }, [refresh])

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

  const handleRootContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (!workspacePath) return
    setCtxMenu({ x: e.clientX, y: e.clientY, node: null })
  }, [workspacePath])

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+Z undo (works regardless of selection)
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        // Only handle if the explorer sidebar is focused
        const active = useStore.getState().activeSidebar
        if (active === 'explorer' && undoStack.current.length > 0) {
          e.preventDefault()
          handleUndo()
          return
        }
      }
      if (!selectedPath) return
      if (e.key === 'F2') {
        e.preventDefault()
        setRenamingPath(selectedPath)
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        const node = findNodeByPath(roots, selectedPath)
        if (node) deleteNode(node)
      }
      // Copy/Cut/Paste
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !e.shiftKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        const active = useStore.getState().activeSidebar
        if (active === 'explorer' && selectedPath) {
          e.preventDefault()
          setClipboard({ path: selectedPath, cut: false })
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        const active = useStore.getState().activeSidebar
        if (active === 'explorer' && selectedPath) {
          e.preventDefault()
          setClipboard({ path: selectedPath, cut: true })
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        const active = useStore.getState().activeSidebar
        if (active === 'explorer') {
          e.preventDefault()
          handlePaste()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedPath, roots, handleUndo, handlePaste])

  // ─── Root-level creating (when creatingIn = workspacePath) ────────────────
  const isCreatingAtRoot = creatingIn === workspacePath

  return (
    <div
      style={{ width: '100%', height: '100%', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      onContextMenu={handleRootContextMenu}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <FolderSearch size={18} color="var(--text-muted)" />
          <span style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Explorer</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {workspacePath && (
            <>
              <button
                onClick={() => { setCreatingIn(workspacePath); setCreatingType('file') }}
                title="New File"
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}
                className="filetree-header-btn"
              >
                <FilePlus size={18} />
              </button>
              <button
                onClick={() => { setCreatingIn(workspacePath); setCreatingType('folder') }}
                title="New Folder"
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}
                className="filetree-header-btn"
              >
                <FolderPlus size={18} />
              </button>
            </>
          )}
          <button onClick={openWorkspace} title="Open folder" className="filetree-header-btn" style={{ color: 'var(--text-muted)', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}>
            <FolderOpen size={18} />
          </button>
        </div>
      </div>

      {/* File list */}
      <div
        style={{ overflowY: 'auto', flex: 1, padding: '4px' }}
        onDragOver={e => {
          if (!workspacePath || !e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={e => {
          if (!workspacePath || e.dataTransfer.files.length === 0) return
          // Only handle if not already caught by a folder row
          e.preventDefault()
          handleExternalDrop(Array.from(e.dataTransfer.files), workspacePath)
        }}
      >
        {roots.length === 0 && !isCreatingAtRoot ? (
          <div style={{ color: 'var(--text-ghost)', padding: '24px 12px', fontSize: 13, textAlign: 'center', lineHeight: 1.8 }}>
            No workspace open.<br />
            <span style={{ color: 'var(--text-muted)' }}>Click the folder icon to summon one.</span>
          </div>
        ) : (
          <>
            {/* Root-level create input */}
            {isCreatingAtRoot && creatingType && (
              <InlineInput
                defaultValue=""
                icon={creatingType === 'folder'
                  ? <Folder size={ICON_SIZE} color="var(--accent)" style={{ flexShrink: 0 }} />
                  : <File size={ICON_SIZE} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                }
                depth={0}
                onSubmit={(name) => handleCreateSubmit(workspacePath!, name)}
                onCancel={() => { setCreatingIn(null); setCreatingType(null) }}
              />
            )}
            {roots.map((n) => (
              <FileRow
                key={n.id} node={n} depth={0} onOpen={handleOpen}
                onContextMenu={handleContextMenu}
                selectedPath={selectedPath} onSelect={setSelectedPath}
                renamingPath={renamingPath}
                onRenameSubmit={handleRenameSubmit} onRenameCancel={() => setRenamingPath(null)} onStartRename={setRenamingPath}
                onMoveFile={handleMoveFile} onExternalDrop={handleExternalDrop}
                creatingIn={creatingIn} creatingType={creatingType}
                onCreateSubmit={handleCreateSubmit}
                onCreateCancel={() => { setCreatingIn(null); setCreatingType(null) }}
                refreshKey={refreshKey}
                ancestorPaths={[]}
                activeAtDepth={[]}
              />
            ))}
          </>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} node={ctxMenu.node}
          onNewFile={() => startCreate('file')}
          onNewFolder={() => startCreate('folder')}
          onRename={() => ctxMenu.node && setRenamingPath(ctxMenu.node.path)}
          onDelete={() => ctxMenu.node && deleteNode(ctxMenu.node)}
          onUndo={handleUndo}
          canUndo={undoStack.current.length > 0}
          onCopyPath={() => ctxMenu.node && navigator.clipboard.writeText(ctxMenu.node.path)}
          onCopyRelativePath={() => {
            if (ctxMenu.node && workspacePath) {
              const rel = ctxMenu.node.path.startsWith(workspacePath)
                ? ctxMenu.node.path.slice(workspacePath.length + 1)
                : ctxMenu.node.path
              navigator.clipboard.writeText(rel)
            }
          }}
          onRevealInFileManager={() => ctxMenu.node && window.electron.shell.showItemInFolder(ctxMenu.node.path)}
          onClose={() => setCtxMenu(null)}
        />
      )}

    </div>
  )
}
