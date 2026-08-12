import type { SessionMeta } from '../../shared/protocol';
import { chipToneForStatus } from '../lib/statusChip';
import { useStore } from '../store';

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export function SessionList({ sessions }: { sessions: SessionMeta[] }) {
  const selectedSessionId = useStore((s) => s.selectedSessionId);
  const selectSession = useStore((s) => s.selectSession);

  if (sessions.length === 0) {
    return <div className="empty-hint">No sessions yet.</div>;
  }

  return (
    <div className="session-list">
      {[...sessions].reverse().map((session) => {
        const tone = chipToneForStatus(session.status);
        return (
          <button
            key={session.id}
            type="button"
            className={`session-row ${session.id === selectedSessionId ? 'session-row-selected' : ''}`}
            onClick={() => selectSession(session.id)}
            title={session.error ?? `${session.agentName} · ${session.cwd}`}
          >
            <span className="session-agent-name">{session.agentName}</span>
            <span className="session-id">{shortId(session.id)}</span>
            <span className={`status-chip status-chip-${tone}`}>{session.status}</span>
          </button>
        );
      })}
    </div>
  );
}
