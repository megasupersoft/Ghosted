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
} from 'lucide-react'

interface FileNode { id: string; name: string; path: string; isDirectory: boolean }

const ICON_SIZE = 14

// ─── File icon by extension ──────────────────────────────────────────────────

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const s = { flexShrink: 0 } as const

  switch (ext) {
    case 'ts': case 'tsx':
      return <FileCode size={ICON_SIZE} color="var(--accent)" style={s} />
    case 'js': case 'jsx':
      return <FileCode size={ICON_SIZE} color="var(--amber)" style={s} />
    case 'py':
      return <FileCode size={ICON_SIZE} color="var(--green)" style={s} />
    case 'rs':
      return <FileCode size={ICON_SIZE} color="var(--red)" style={s} />
    case 'go':
      return <FileCode size={ICON_SIZE} color="var(--cyan)" style={s} />
    case 'md': case 'mdx': case 'txt':
      return <FileText size={ICON_SIZE} color="var(--text-secondary)" style={s} />
    case 'json':
      return <Braces size={ICON_SIZE} color="var(--amber)" style={s} />
    case 'css': case 'scss': case 'less':
      return <Hash size={ICON_SIZE} color="var(--purple)" style={s} />
    case 'html':
      return <Globe size={ICON_SIZE} color="var(--red)" style={s} />
    case 'yaml': case 'yml': case 'toml': case 'ini': case 'env':
      return <Settings size={ICON_SIZE} color="var(--text-muted)" style={s} />
    case 'canvas':
      return <Workflow size={ICON_SIZE} color="var(--amber)" style={s} />
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp': case 'ico':
      return <FileImage size={ICON_SIZE} color="var(--purple)" style={s} />
    case 'sh': case 'bash': case 'zsh':
      return <FileType size={ICON_SIZE} color="var(--green)" style={s} />
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
  onCopyPath: () => void
  onCopyRelativePath: () => void
  onRevealInFileManager: () => void
  onClose: () => void
}

function ContextMenu({ x, y, node, onNewFile, onNewFolder, onRename, onDelete, onCopyPath, onCopyRelativePath, onRevealInFileManager, onClose }: ContextMenuProps) {
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

// ─── Delete confirmation ──────────────────────────────────────────────────────

function DeleteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onConfirm, onCancel])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1001,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }} onClick={onCancel}>
      <div ref={ref} onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)',
        borderRadius: 'var(--radius-lg)', padding: '16px 20px', minWidth: 280,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 12 }}>
          Delete <strong>{name}</strong>?
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          This action cannot be undone.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{
            fontSize: 12, padding: '5px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-mid)', color: 'var(--text-secondary)',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            fontSize: 12, padding: '5px 14px', borderRadius: 'var(--radius-sm)',
            background: 'var(--red)', color: '#fff', border: 'none',
          }}>Delete</button>
        </div>
      </div>
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
  creatingIn: string | null
  creatingType: 'file' | 'folder' | null
  onCreateSubmit: (parentPath: string, name: string) => void
  onCreateCancel: () => void
  refreshKey: number
}

function FileRow({
  node, depth, onOpen, onContextMenu, selectedPath, onSelect,
  renamingPath, onRenameSubmit, onRenameCancel,
  creatingIn, creatingType, onCreateSubmit, onCreateCancel,
  refreshKey,
}: FileRowProps) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<FileNode[]>([])
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
        onContextMenu={e => { e.preventDefault(); onSelect(node.path); onContextMenu(e, node) }}
        className="filetree-row"
        style={{
          paddingLeft: 6 + depth * 14,
          background: isSelected ? 'var(--bg-selection)' : undefined,
        }}
      >
        {node.isDirectory ? (
          <>
            {open
              ? <ChevronDown size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              : <ChevronRight size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            }
            {open
              ? <FolderOpen size={ICON_SIZE} color="var(--accent)" style={{ flexShrink: 0 }} />
              : <Folder size={ICON_SIZE} color="var(--accent-bright)" style={{ flexShrink: 0 }} />
            }
          </>
        ) : (
          <>
            <span style={{ width: 12, flexShrink: 0 }} />
            <FileIcon name={node.name} />
          </>
        )}
        <span className="filetree-name" style={{ color: node.isDirectory ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
          {node.name}
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

      {open && children.map(c => (
        <FileRow
          key={c.id} node={c} depth={depth + 1} onOpen={onOpen}
          onContextMenu={onContextMenu} selectedPath={selectedPath} onSelect={onSelect}
          renamingPath={renamingPath} onRenameSubmit={onRenameSubmit} onRenameCancel={onRenameCancel}
          creatingIn={creatingIn} creatingType={creatingType}
          onCreateSubmit={onCreateSubmit} onCreateCancel={onCreateCancel}
          refreshKey={refreshKey}
        />
      ))}
    </>
  )
}

// ─── Main FileTree ────────────────────────────────────────────────────────────

export default function FileTree() {
  const { workspacePath, setWorkspacePath, openFile, setFocusedLeaf, changeLeafPane, focusedLeafId } = useStore()
  const showHidden = useSettings(s => s.showHiddenFiles)
  const [roots, setRoots] = useState<FileNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null)

  // Inline create state
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null)

  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null)

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

  // ─── File watcher ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspacePath) return
    window.electron.fs.watch(workspacePath)

    let debounce: ReturnType<typeof setTimeout>
    window.electron.fs.onChanged(() => {
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        loadDir(workspacePath)
        setRefreshKey(k => k + 1)
      }, 200)
    })

    return () => {
      window.electron.fs.unwatch(workspacePath)
      window.electron.fs.offChanged()
      clearTimeout(debounce)
    }
  }, [workspacePath, loadDir])

  // ─── File open handler ──────────────────────────────────────────────────────
  const handleOpen = useCallback(async (node: FileNode) => {
    try {
      const ext = node.name.split('.').pop()?.toLowerCase() ?? ''
      const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']
      const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogg']

      if (ext === 'canvas') {
        const content = await window.electron.fs.readfile(node.path).catch(() => '{}')
        openFile(node.path, node.name, content, 'canvas')
        const { layout } = useStore.getState()
        const canvasLeaf = findFirstLeafByPane(layout, 'canvas')
        if (canvasLeaf) {
          setFocusedLeaf(canvasLeaf.id)
        } else {
          changeLeafPane(focusedLeafId, 'canvas')
        }
        return
      }

      let content = ''
      let fileType: 'text' | 'image' | 'video' = 'text'

      if (IMAGE_EXTS.includes(ext)) {
        fileType = 'image'
      } else if (VIDEO_EXTS.includes(ext)) {
        fileType = 'video'
      } else {
        content = await window.electron.fs.readfile(node.path)
      }

      openFile(node.path, node.name, content, fileType)
      const editorLeafId = getEditorLeafId()
      if (editorLeafId) {
        setFocusedLeaf(editorLeafId)
      } else {
        changeLeafPane(focusedLeafId, 'editor')
      }
    } catch {}
  }, [openFile, setFocusedLeaf, changeLeafPane, focusedLeafId])

  // ─── CRUD operations ───────────────────────────────────────────────────────

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
      if (creatingType === 'folder') {
        await window.electron.fs.mkdir(fullPath)
      } else {
        await window.electron.fs.newfile(fullPath)
      }
    } catch {}
    setCreatingIn(null)
    setCreatingType(null)
  }

  const handleRenameSubmit = async (oldPath: string, newName: string) => {
    try {
      const parentDir = oldPath.slice(0, oldPath.lastIndexOf('/'))
      const newPath = `${parentDir}/${newName}`
      await window.electron.fs.rename(oldPath, newPath)
    } catch {}
    setRenamingPath(null)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await window.electron.fs.delete(deleteTarget.path)
    } catch {}
    setDeleteTarget(null)
  }

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
      if (!selectedPath) return
      if (e.key === 'F2') {
        e.preventDefault()
        setRenamingPath(selectedPath)
      }
      if (e.key === 'Delete') {
        e.preventDefault()
        const node = findNodeByPath(roots, selectedPath)
        if (node) setDeleteTarget(node)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedPath, roots])

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
          <FolderSearch size={14} color="var(--text-muted)" />
          <span style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Explorer</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {workspacePath && (
            <>
              <button
                onClick={() => { setCreatingIn(workspacePath); setCreatingType('file') }}
                title="New File"
                style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}
                className="filetree-header-btn"
              >
                <FilePlus size={14} />
              </button>
              <button
                onClick={() => { setCreatingIn(workspacePath); setCreatingType('folder') }}
                title="New Folder"
                style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}
                className="filetree-header-btn"
              >
                <FolderPlus size={14} />
              </button>
            </>
          )}
          <button onClick={openWorkspace} style={{ fontSize: 12, color: 'var(--accent)', padding: '3px 8px', borderRadius: 3, border: '1px solid var(--accent-dim)', boxShadow: '0 0 6px var(--accent-glow)' }}>
            Open
          </button>
        </div>
      </div>

      {/* File list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px' }}>
        {roots.length === 0 && !isCreatingAtRoot ? (
          <div style={{ color: 'var(--text-ghost)', padding: '24px 12px', fontSize: 13, textAlign: 'center', lineHeight: 1.8 }}>
            No workspace open.<br />
            <span style={{ color: 'var(--text-muted)' }}>Click Open to summon one.</span>
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
            {roots.map(n => (
              <FileRow
                key={n.id} node={n} depth={0} onOpen={handleOpen}
                onContextMenu={handleContextMenu}
                selectedPath={selectedPath} onSelect={setSelectedPath}
                renamingPath={renamingPath}
                onRenameSubmit={handleRenameSubmit} onRenameCancel={() => setRenamingPath(null)}
                creatingIn={creatingIn} creatingType={creatingType}
                onCreateSubmit={handleCreateSubmit}
                onCreateCancel={() => { setCreatingIn(null); setCreatingType(null) }}
                refreshKey={refreshKey}
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
          onDelete={() => ctxMenu.node && setDeleteTarget(ctxMenu.node)}
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

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <DeleteConfirm
          name={deleteTarget.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
