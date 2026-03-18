import React from 'react'
import { Ghost } from 'lucide-react'

export default function Titlebar() {
  return (
    <div style={{
      height: 'var(--titlebar-h)',
      background: 'var(--bg-base)',
      display: 'flex', alignItems: 'center',
      WebkitAppRegion: 'drag' as any,
      userSelect: 'none', flexShrink: 0,
    }}>
      <div style={{ flex: 1 }} />
      <div style={{ marginRight: 16, WebkitAppRegion: 'no-drag' as any, display: 'flex', alignItems: 'center' }}>
        <Ghost size={18} color="var(--accent)" style={{ opacity: 0.5, display: 'block' }} />
      </div>
    </div>
  )
}
