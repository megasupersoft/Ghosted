import type { PlanEntry } from './chatItems'

function isDone(status?: string): boolean {
  return status === 'completed' || status === 'done'
}

export default function PlanCard({ entries }: { entries: PlanEntry[] }) {
  return (
    <div
      style={{
        alignSelf: 'stretch',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-elevated)',
        padding: '10px 12px',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          marginBottom: 6,
        }}
      >
        Plan
      </div>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entries.map((entry, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: plan snapshot is replaced wholesale on each update
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 13,
              color: isDone(entry.status) ? 'var(--text-muted)' : 'var(--text-primary)',
              textDecoration: isDone(entry.status) ? 'line-through' : 'none',
            }}
          >
            <span style={{ flexShrink: 0, color: 'var(--accent)' }}>{isDone(entry.status) ? '☑' : '☐'}</span>
            <span style={{ flex: 1 }}>{entry.content}</span>
            {entry.priority && (
              <span style={{ fontSize: 10, color: 'var(--text-ghost)', flexShrink: 0 }}>
                {entry.priority}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
