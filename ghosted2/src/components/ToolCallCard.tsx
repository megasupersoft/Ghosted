import type { ToolItem } from '../lib/chatItems';

function statusGlyph(status?: string): { glyph: string; className: string } {
  switch (status) {
    case 'completed':
      return { glyph: '✓', className: 'tool-status-done' };
    case 'failed':
      return { glyph: '✗', className: 'tool-status-failed' };
    case 'in_progress':
    case 'pending':
      return { glyph: '', className: 'tool-status-spinner' };
    default:
      return { glyph: '•', className: 'tool-status-unknown' };
  }
}

export function ToolCallCard({ item }: { item: ToolItem }) {
  const { glyph, className } = statusGlyph(item.status);

  return (
    <div className="tool-call-card">
      <div className="tool-call-header">
        <span className={`tool-status ${className}`}>{glyph}</span>
        {item.toolKind && <span className="tool-kind-badge">{item.toolKind}</span>}
        <span className="tool-title">{item.title ?? item.toolCallId}</span>
      </div>
      {item.locations && item.locations.length > 0 && (
        <div className="tool-locations">
          {item.locations.map((loc, i) => (
            <div className="tool-location" key={`${loc.path}-${i}`}>
              {loc.path}
              {loc.line !== undefined ? `:${loc.line}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
