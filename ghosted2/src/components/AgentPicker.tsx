import type { AgentInfo } from '../../shared/protocol';
import { useStore } from '../store';

export function AgentPicker({ agents }: { agents: AgentInfo[] }) {
  const newSession = useStore((s) => s.newSession);

  if (agents.length === 0) {
    return <div className="empty-hint">No agents available.</div>;
  }

  return (
    <div className="agent-list">
      {agents.map((agent) => (
        <button
          key={agent.id}
          type="button"
          className="agent-row"
          disabled={!agent.available}
          title={agent.description ?? agent.name}
          onClick={() => newSession(agent.id)}
        >
          <span className={`dot ${agent.available ? 'dot-available' : 'dot-unavailable'}`} />
          <span className="agent-name">{agent.name}</span>
        </button>
      ))}
    </div>
  );
}
