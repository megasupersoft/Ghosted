import React from 'react'
import { useStore } from '@/store'
import { Files, GitFork, Settings } from 'lucide-react'

const ITEMS = [
  { id: 'explorer', icon: Files, label: 'Explorer' },
  { id: 'source-control', icon: GitFork, label: 'Source Control' },
] as const

const BOTTOM_ITEMS = [
  { id: 'settings', icon: Settings, label: 'Settings' },
] as const

export default function ActivityBar() {
  const { activeSidebar, toggleSidebar } = useStore()

  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {ITEMS.map(item => (
          <button
            key={item.id}
            className={`activity-bar-btn ${activeSidebar === item.id ? 'active' : ''}`}
            onClick={() => toggleSidebar(item.id)}
            title={item.label}
          >
            <item.icon size={20} />
          </button>
        ))}
      </div>
      <div className="activity-bar-bottom">
        {BOTTOM_ITEMS.map(item => (
          <button
            key={item.id}
            className={`activity-bar-btn ${activeSidebar === item.id ? 'active' : ''}`}
            onClick={() => toggleSidebar(item.id)}
            title={item.label}
          >
            <item.icon size={20} />
          </button>
        ))}
      </div>
    </div>
  )
}
