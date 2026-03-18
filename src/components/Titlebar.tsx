import React from 'react'
import { useStore, PaneId } from '@/store'

const PANES: { id: PaneId; label: string }[] = [
  { id: 'editor',   label: 'Editor'   },
  { id: 'terminal', label: 'Terminal' },
  { id: 'graph',    label: 'Graph'    },
  { id: 'canvas',   label: 'Canvas'   },
  { id: 'kanban',   label: 'Kanban'   },
]

export default function Titlebar() {
  const { activePane, setActivePane, workspacePath } = useStore()
  const wsName = workspacePath?.split('/').pop() ?? null

  return (
    <div style={{
      height: 'var(--titlebar-h)',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      WebkitAppRegion: 'drag' as any,
      userSelect: 'none', flexShrink: 0,
    }}>
      <div style={{ width: 80, flexShrink: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 20, WebkitAppRegion: 'no-drag' as any }}>
        <span style={{ fontSize: 14, opacity: 0.2 }}>👻</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85 }}>
          ghosted
        </span>
        {wsName && (
          <>
            <span style={{ color: 'var(--text-ghost)', fontSize: 11 }}>/</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{wsName}</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 1, WebkitAppRegion: 'no-drag' as any }}>
        {PANES.map(p => {
          const active = activePane === p.id
          return (
            <button key={p.id} onClick={() => setActivePane(p.id)} style={{
              height: 28, padding: '0 13px', borderRadius: 'var(--radius-sm)', fontSize: 11,
              background: active ? 'var(--bg-selection)' : 'transparent',
              color: active ? 'var(--accent-bright)' : 'var(--text-muted)',
              border: active ? '1px solid var(--border-mid)' : '1px solid transparent',
              display: 'flex', alignItems: 'center', gap: 5,
              boxShadow: active ? '0 0 8px var(--accent-glow)' : 'none',
              transition: 'all 0.15s',
            }}>
              {active && <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, boxShadow: '0 0 6px var(--accent)' }} className="ghost-pulse" />}
              {p.label}
            </button>
          )
        })}
      </div>
      <div style={{ marginLeft: 'auto', marginRight: 16, WebkitAppRegion: 'no-drag' as any }}>
        <span style={{ fontSize: 10, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>v0.1.0</span>
      </div>
    </div>
  )
}
