import { Command } from 'cmdk'
import {
  CalendarRange,
  FilePlus,
  FileText,
  FolderOpen,
  GitBranch,
  Kanban,
  LayoutGrid,
  Network,
  PanelLeft,
  Settings,
  Sparkles,
  SquarePen,
  Terminal,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import type { PaneId } from '@/store/layout'
import type { GhostedFile } from '@/types/electron'

const PANES: { id: PaneId; label: string; icon: React.ReactNode }[] = [
  { id: 'editor', label: 'Editor', icon: <SquarePen size={16} /> },
  { id: 'terminal', label: 'Terminal', icon: <Terminal size={16} /> },
  { id: 'graph', label: 'Knowledge Graph', icon: <Network size={16} /> },
  { id: 'canvas', label: 'Canvas', icon: <LayoutGrid size={16} /> },
  { id: 'kanban', label: 'Kanban', icon: <Kanban size={16} /> },
  { id: 'timeline', label: 'Timeline', icon: <CalendarRange size={16} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
  { id: 'ai', label: 'AI', icon: <Sparkles size={16} /> },
]

const SIDEBARS = [
  { id: 'explorer', label: 'Explorer', icon: <PanelLeft size={16} /> },
  { id: 'source-control', label: 'Source Control', icon: <GitBranch size={16} /> },
]

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<GhostedFile[]>([])
  const workspacePath = useStore((s) => s.workspacePath)

  // ⌘K / Ctrl+K toggles the palette. Capture phase so the shortcut wins even
  // when focus is inside xterm, which swallows Ctrl+K as a control sequence.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        e.stopPropagation()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Load workspace files from GhostedDB whenever the palette opens
  useEffect(() => {
    if (!open || !workspacePath) return
    let cancelled = false
    window.electron.db
      .query({ limit: 400, orderBy: 'mtime', orderDir: 'desc' })
      .then((r) => {
        if (!cancelled) setFiles(r.files)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, workspacePath])

  const run = useCallback((action: () => void | Promise<void>) => {
    setOpen(false)
    void action()
  }, [])

  const openWorkspaceFile = useCallback(
    (f: GhostedFile) =>
      run(async () => {
        try {
          const content = await window.electron.fs.readfile(f.path)
          // f.name is the extension-less wikilink name — the editor needs the
          // real filename for tab labels and language detection.
          const fileName = f.path.split('/').pop() ?? f.name
          useStore.getState().openFile(f.path, fileName, content, 'text')
        } catch {}
      }),
    [run],
  )

  const fileItems = useMemo(
    () =>
      files.map((f) => (
        <Command.Item
          key={f.path}
          value={`file ${f.relativePath}`}
          keywords={[f.name]}
          onSelect={() => openWorkspaceFile(f)}
          className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-secondary-foreground data-[selected=true]:bg-hover data-[selected=true]:text-foreground"
        >
          <FileText size={16} className="shrink-0 opacity-60" />
          <span className="truncate">{f.relativePath}</span>
        </Command.Item>
      )),
    [files, openWorkspaceFile],
  )

  if (!open) return null

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed inset-0 z-[1000]"
      overlayClassName="fixed inset-0 bg-black/50"
    >
      <div
        className="fixed top-[18%] left-1/2 w-[560px] max-w-[90vw] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl shadow-black/60"
        style={{ colorScheme: 'dark' }}
      >
        <Command.Input
          autoFocus
          placeholder="Type a command or search files…"
          className="w-full border-b border-border bg-transparent px-4 py-3.5 font-sans text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <Command.List className="max-h-[340px] overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted-foreground">
            No results.
          </Command.Empty>

          <Command.Group
            heading="Panes"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-sans [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
          >
            {PANES.map((p) => (
              <Command.Item
                key={p.id}
                value={`Open ${p.label} Pane`}
                keywords={['pane', p.id]}
                onSelect={() =>
                  run(() => {
                    const s = useStore.getState()
                    s.addTab(s.focusedLeafId, p.id)
                  })
                }
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-secondary-foreground data-[selected=true]:bg-hover data-[selected=true]:text-foreground"
              >
                <span className="opacity-60">{p.icon}</span>
                Open {p.label} Pane
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group
            heading="Sidebar"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-sans [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
          >
            {SIDEBARS.map((s) => (
              <Command.Item
                key={s.id}
                value={`Toggle ${s.label}`}
                keywords={['sidebar']}
                onSelect={() => run(() => useStore.getState().toggleSidebar(s.id))}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-secondary-foreground data-[selected=true]:bg-hover data-[selected=true]:text-foreground"
              >
                <span className="opacity-60">{s.icon}</span>
                Toggle {s.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group
            heading="Workspace"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-sans [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
          >
            <Command.Item
              value="Open Folder"
              keywords={['workspace']}
              onSelect={() =>
                run(async () => {
                  const folder = await window.electron.dialog.openFolder()
                  if (folder) useStore.getState().setWorkspacePath(folder)
                })
              }
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-secondary-foreground data-[selected=true]:bg-hover data-[selected=true]:text-foreground"
            >
              <FolderOpen size={16} className="opacity-60" />
              Open Folder…
            </Command.Item>
            <Command.Item
              value="Install ghosted CLI"
              keywords={['terminal', 'shell', 'path', 'launcher']}
              onSelect={() =>
                run(async () => {
                  const res = await window.electron.cli.install()
                  const s = useStore.getState()
                  if (res.ok) s.addStatus('info', `ghosted CLI installed at ${res.path}`)
                  else s.addStatus('error', `CLI install failed: ${res.error}`)
                })
              }
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-secondary-foreground data-[selected=true]:bg-hover data-[selected=true]:text-foreground"
            >
              <Terminal size={16} className="opacity-60" />
              Install ghosted CLI (`ghosted .` in your shell)
            </Command.Item>
            <Command.Item
              value="New File"
              keywords={['workspace', 'create']}
              onSelect={() =>
                run(() => {
                  const s = useStore.getState()
                  if (!s.activeSidebar) s.toggleSidebar('explorer')
                })
              }
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-secondary-foreground data-[selected=true]:bg-hover data-[selected=true]:text-foreground"
            >
              <FilePlus size={16} className="opacity-60" />
              New File (via Explorer)
            </Command.Item>
          </Command.Group>

          {files.length > 0 && (
            <Command.Group
              heading="Files"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-sans [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
            >
              {fileItems}
            </Command.Group>
          )}
        </Command.List>
        <div className="flex items-center gap-3 border-t border-border px-4 py-2 font-sans text-[11px] text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </Command.Dialog>
  )
}
