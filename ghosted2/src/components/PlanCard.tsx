import type { PlanEntry } from '../lib/chatItems';

function isDone(status?: string): boolean {
  return status === 'completed' || status === 'done';
}

export function PlanCard({ entries }: { entries: PlanEntry[] }) {
  return (
    <div className="plan-card">
      <div className="plan-card-header">Plan</div>
      <ul className="plan-list">
        {entries.map((entry, i) => (
          <li key={i} className={`plan-entry ${isDone(entry.status) ? 'plan-entry-done' : ''}`}>
            <span className="plan-checkbox">{isDone(entry.status) ? '☑' : '☐'}</span>
            <span className="plan-content">{entry.content}</span>
            {entry.priority && <span className="plan-priority">{entry.priority}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
