import { useState } from 'react';
import type { PermissionRequest } from '../../shared/protocol';
import { useStore } from '../store';

export function PermissionCard({ request }: { request: PermissionRequest }) {
  const decide = useStore((s) => s.decide);
  const [decided, setDecided] = useState(false);

  return (
    <div className="permission-card">
      <div className="permission-title">{request.title ?? 'Permission requested'}</div>
      <div className="permission-options">
        {request.options.map((opt) => (
          <button
            key={opt.optionId}
            type="button"
            className="permission-option-btn"
            disabled={decided}
            onClick={() => {
              setDecided(true);
              decide(request.requestId, opt.optionId);
            }}
          >
            {opt.name}
          </button>
        ))}
      </div>
    </div>
  );
}
