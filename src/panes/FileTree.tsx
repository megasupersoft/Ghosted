import React, { useEffect, useState, useCallback } from 'react'
import { useStore, getEditorLeafId } from '@/store'
import { useSettings } from '@/store/settings'
import {
  Folder, FolderOpen, ChevronRight, ChevronDown,
  FileCode, FileText, FileJson, File, FileImage,
  FileType, Braces, Settings, Hash, Globe,
  FolderSearch,
} from 'lucide-react'

interface FileNode { id: string; name: string; path: string; isDirectory: boolean }

const ICON_SIZE = 14

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
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp': case 'ico':
      return <FileImage size={ICON_SIZE} color="var(--purple)" style={s} />
    case 'sh': case 'bash': case 'zsh':
      return <FileType size={ICON_SIZE} color="var(--green)" style={s} />
    default:
      return <File size={ICON_SIZE} color="var(--text-muted)" style={s} />
  }
}

function FileRow({ node, depth, onOpen }: { node: FileNode; depth: number; onOpen: (n: FileNode) => void }) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<FileNode[]>([])
  const showHidden = useSettings(s => s.showHiddenFiles)

  const toggle = async () => {
    if (!node.isDirectory) { onOpen(node); return }
    if (!open) {
      const entries = await window.electron.fs.readdir(node.path)
      setChildren(entries
        .filter(e => showHidden || !e.name.startsWith('.'))
        .sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name))
        .map(e => ({ id: e.path, name: e.name, path: e.path, isDirectory: e.isDirectory }))
      )
    }
    setOpen(o => !o)
  }

  return (
    <>
      <div onClick={toggle} className="filetree-row" style={{ paddingLeft: 6 + depth * 14 }}>
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
      {open && children.map(c => <FileRow key={c.id} node={c} depth={depth + 1} onOpen={onOpen} />)}
    </>
  )
}

export default function FileTree() {
  const { workspacePath, setWorkspacePath, openFile, setFocusedLeaf, changeLeafPane, focusedLeafId } = useStore()
  const showHidden = useSettings(s => s.showHiddenFiles)
  const [roots, setRoots] = useState<FileNode[]>([])

  const loadDir = useCallback(async (p: string) => {
    const entries = await window.electron.fs.readdir(p)
    setRoots(entries
      .filter(e => showHidden || !e.name.startsWith('.'))
      .sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name))
      .map(e => ({ id: e.path, name: e.name, path: e.path, isDirectory: e.isDirectory }))
    )
  }, [showHidden])

  const openWorkspace = async () => {
    const chosen = await window.electron.dialog.openFolder()
    if (!chosen) return
    setWorkspacePath(chosen)
    loadDir(chosen)
  }

  useEffect(() => { if (workspacePath) loadDir(workspacePath) }, [workspacePath, loadDir])

  const handleOpen = useCallback(async (node: FileNode) => {
    try {
      const ext = node.name.split('.').pop()?.toLowerCase() ?? ''
      const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']
      const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogg']

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

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <FolderSearch size={14} color="var(--text-muted)" />
          <span style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Explorer</span>
        </div>
        <button onClick={openWorkspace} style={{ fontSize: 12, color: 'var(--accent)', padding: '3px 8px', borderRadius: 3, border: '1px solid var(--accent-dim)', boxShadow: '0 0 6px var(--accent-glow)' }}>
          Open
        </button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px' }}>
        {roots.length === 0 ? (
          <div style={{ color: 'var(--text-ghost)', padding: '24px 12px', fontSize: 13, textAlign: 'center', lineHeight: 1.8 }}>
            No workspace open.<br />
            <span style={{ color: 'var(--text-muted)' }}>Click Open to summon one.</span>
          </div>
        ) : roots.map(n => <FileRow key={n.id} node={n} depth={0} onOpen={handleOpen} />)}
      </div>
    </div>
  )
}
