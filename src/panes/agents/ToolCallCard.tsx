import type { ToolItem } from './chatItems'

function statusGlyph(status?: string): { glyph: string; color: string; spin?: boolean } {
  switch (status) {
    case 'completed':
      return { glyph: '✓', color: 'var(--green)' }
    case 'failed':
      return { glyph: '✗', color: 'var(--red)' }
    case 'in_progress':
    case 'pending':
      return { glyph: '●', color: 'var(--accent)', spin: true }
    default:
      return { glyph: '•', color: 'var(--text-muted)' }
  }
}

export default function ToolCallCard({ item }: { item: ToolItem }) {
  const { glyph, color, spin } = statusGlyph(item.status)

  return (
    <div
      style={{
        alignSelf: 'stretch',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-elevated)',
        padding: '8px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={spin ? 'ghost-pulse' : undefined} style={{ color, flexShrink: 0 }}>
          {glyph}
        </span>
        {item.toolKind && (
          <span
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
              background: 'var(--bg-hover)',
              borderRadius: 'var(--radius-sm)',
              padding: '1px 6px',
              flexShrink: 0,
            }}
          >
            {item.toolKind}
          </span>
        )}
        <span
          style={{
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title ?? item.toolCallId}
        </span>
      </div>
      {item.locations && item.locations.length > 0 && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {item.locations.map((loc, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: locations list is replaced wholesale on each update
              key={i}
              style={{ color: 'var(--text-muted)', fontSize: 11 }}
            >
              {loc.path}
              {loc.line !== undefined ? `:${loc.line}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
