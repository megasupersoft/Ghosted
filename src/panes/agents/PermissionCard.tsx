import { useState } from 'react'
import { useAgentsStore } from '@/store/agents'
import type { PermissionRequest } from '@/types/acp'

export default function PermissionCard({ request }: { request: PermissionRequest }) {
  const decide = useAgentsStore((s) => s.decide)
  const [decided, setDecided] = useState(false)

  return (
    <div
      style={{
        alignSelf: 'stretch',
        border: '1px solid var(--amber)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-elevated)',
        padding: '10px 12px',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>
        {request.title ?? 'Permission requested'}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {request.options.map((opt) => (
          <button
            key={opt.optionId}
            type="button"
            disabled={decided}
            onClick={() => {
              setDecided(true)
              decide(request.requestId, opt.optionId)
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: decided ? 'var(--bg-hover)' : 'var(--accent)',
              color: decided ? 'var(--text-muted)' : '#fff',
              fontSize: 12,
              cursor: decided ? 'default' : 'pointer',
            }}
          >
            {opt.name}
          </button>
        ))}
      </div>
    </div>
  )
}
