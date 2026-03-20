import React, { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { Files, GitFork, Settings } from 'lucide-react'

const BOTTOM_ITEMS = [
  { id: 'settings', icon: Settings, label: 'Settings' },
] as const

export default function ActivityBar() {
  const { activeSidebar, toggleSidebar, workspacePath } = useStore()
  const [changeCount, setChangeCount] = useState(0)

  useEffect(() => {
    if (!workspacePath) { setChangeCount(0); return }
    let cancelled = false
    const poll = async () => {
      try {
        const status = await window.electron.git.status(workspacePath)
        if (!cancelled) setChangeCount(status.length)
      } catch { if (!cancelled) setChangeCount(0) }
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [workspacePath])

  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        <button
          className={`activity-bar-btn ${activeSidebar === 'explorer' ? 'active' : ''}`}
          onClick={() => toggleSidebar('explorer')}
          title="Explorer"
        >
          <Files size={24} />
        </button>
        <button
          className={`activity-bar-btn ${activeSidebar === 'source-control' ? 'active' : ''}`}
          onClick={() => toggleSidebar('source-control')}
          title="Source Control"
          style={{ position: 'relative' }}
        >
          <GitFork size={24} />
          {changeCount > 0 && (
            <span style={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'var(--font-ui)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              lineHeight: 1,
            }}>
              {changeCount > 99 ? '99+' : changeCount}
            </span>
          )}
        </button>
      </div>
      <div className="activity-bar-bottom">
        {BOTTOM_ITEMS.map(item => (
          <button
            key={item.id}
            className={`activity-bar-btn ${activeSidebar === item.id ? 'active' : ''}`}
            onClick={() => toggleSidebar(item.id)}
            title={item.label}
          >
            <item.icon size={24} />
          </button>
        ))}
      </div>
    </div>
  )
}
