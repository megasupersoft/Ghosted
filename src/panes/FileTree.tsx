import React, { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/store'

interface FileNode { id: string; name: string; path: string; isDirectory: boolean }

function getIcon(name: string, isDir: boolean) {
  if (isDir) return null
  const ext = name.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: '·', tsx: '·', js: '·', jsx: '·', md: '·',
    json: '·', css: '·', html: '·', py: '·', rs: '·',
    go: '·', sh: '·', yaml: '·', yml: '·',
  }
  return map[ext ?? ''] ?? '·'
}

function FileRow({ node, depth, onOpen }: { node: FileNode; depth: number; onOpen: (n: FileNode) => void }) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<FileNode[]>([])

  const toggle = async () => {
    if (!node.isDirectory) { onOpen(node); return }
    if (!open) {
      const entries = await window.electron.fs.readdir(node.path)
      setChildren(entries
        .filter(e => !e.name.startsWith('.'))
        .sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name))
        .map(e => ({ id: e.path, name: e.name, path: e.path, isDirectory: e.isDirectory }))
      )
    }
    setOpen(o => !o)
  }

  return (
    <>
      <div onClick={toggle} style={{
        display: 'flex', alignItems: 'center', gap: 5,
        paddingLeft: 8 + depth * 14, height: 24, cursor: 'pointer',
        borderRadius: 'var(--radius-sm)',
        color: node.isDirectory ? 'var(--text-secondary)' : 'var(--text-primary)',
        fontSize: 12,
      }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ fontSize: 9, width: 10, flexShrink: 0, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {node.isDirectory ? (open ? '▾' : '▸') : '·'}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
      </div>
      {open && children.map(c => <FileRow key={c.id} node={c} depth={depth + 1} onOpen={onOpen} />)}
    </>
  )
}

export default function FileTree() {
  const { workspacePath, setWorkspacePath, openFile, setActivePane } = useStore()
  const [roots, setRoots] = useState<FileNode[]>([])

  const loadDir = useCallback(async (p: string) => {
    const entries = await window.electron.fs.readdir(p)
    setRoots(entries
      .filter(e => !e.name.startsWith('.'))
      .sort((a, b) => (b.isDirectory ? 1 : 0) - (a.isDirectory ? 1 : 0) || a.name.localeCompare(b.name))
      .map(e => ({ id: e.path, name: e.name, path: e.path, isDirectory: e.isDirectory }))
    )
  }, [])

  const openWorkspace = async () => {
    const chosen = await window.electron.dialog.openFolder()
    if (!chosen) return
    setWorkspacePath(chosen)
    loadDir(chosen)
  }

  useEffect(() => { if (workspacePath) loadDir(workspacePath) }, [workspacePath, loadDir])

  const handleOpen = useCallback(async (node: FileNode) => {
    try {
      const content = await window.electron.fs.readfile(node.path)
      openFile(node.path, node.name, content)
      setActivePane('editor')
    } catch {}
  }, [openFile, setActivePane])

  return (
    <div style={{ width: 'var(--sidebar-w)', height: '100%', background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Explorer</span>
        <button onClick={openWorkspace} style={{ fontSize: 10, color: 'var(--accent)', padding: '2px 7px', borderRadius: 3, border: '1px solid var(--accent-dim)', boxShadow: '0 0 6px var(--accent-glow)' }}>
          Open
        </button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px' }}>
        {roots.length === 0 ? (
          <div style={{ color: 'var(--text-ghost)', padding: '24px 12px', fontSize: 11, textAlign: 'center', lineHeight: 1.8 }}>
            No workspace open.<br />
            <span style={{ color: 'var(--text-muted)' }}>Click Open to summon one.</span>
          </div>
        ) : roots.map(n => <FileRow key={n.id} node={n} depth={0} onOpen={handleOpen} />)}
      </div>
    </div>
  )
}
