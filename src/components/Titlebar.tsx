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
      {projectName && (
        <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontWeight: 500 }}>
          /{projectName}
        </span>
      )}
      <div style={{ flex: 1 }} />
    </div>
  )
}
