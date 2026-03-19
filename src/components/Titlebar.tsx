import React from 'react'
import { Ghost } from 'lucide-react'
import { useStore } from '@/store'

export default function Titlebar() {
  const workspacePath = useStore(s => s.workspacePath)
  const projectName = workspacePath ? workspacePath.split('/').pop() : null

  return (
    <div style={{
      height: 'var(--titlebar-h)',
      background: 'var(--bg-base)',
      display: 'flex', alignItems: 'center',
      WebkitAppRegion: 'drag' as any,
      userSelect: 'none', flexShrink: 0,
    }}>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 16 }}>
        {projectName && (
          <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {projectName}
          </span>
        )}
        <Ghost size={24} color="var(--accent)" strokeWidth={2.5} style={{ opacity: 0.7 }} />
      </div>
    </div>
  )
}
