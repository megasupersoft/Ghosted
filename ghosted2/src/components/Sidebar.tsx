import { AgentPicker } from './AgentPicker';
import { SessionList } from './SessionList';
import { useStore } from '../store';

export function Sidebar() {
  const connStatus = useStore((s) => s.connStatus);
  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const agents = useStore((s) => s.agents);
  const sessions = useStore((s) => s.sessions);

  return (
    <aside className="sidebar">
      <div className="wordmark">GHOSTED 2.0</div>

      <div className="conn-row">
        <span className={`conn-dot conn-dot-${connStatus}`} title={connStatus} />
        <span className="workspace-root" title={workspaceRoot || 'no workspace'}>
          {workspaceRoot || '—'}
        </span>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-header">New session</div>
        <AgentPicker agents={agents} />
      </div>

      <div className="sidebar-section sidebar-section-grow">
        <div className="sidebar-section-header">Sessions</div>
        <SessionList sessions={sessions} />
      </div>
    </aside>
  );
}
