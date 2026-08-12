import { useState } from 'react';
import type { SessionStatus } from '../../shared/protocol';
import { useStore } from '../store';

const BLOCKED_STATUSES: SessionStatus[] = ['running', 'awaiting-permission', 'starting'];

export function Composer({ status }: { status: SessionStatus }) {
  const prompt = useStore((s) => s.prompt);
  const cancelSession = useStore((s) => s.cancelSession);
  const [text, setText] = useState('');

  const disabled = BLOCKED_STATUSES.includes(status);

  function send() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    prompt(trimmed);
    setText('');
  }

  return (
    <div className="composer">
      <textarea
        className="composer-textarea"
        placeholder={disabled ? 'Agent is busy…' : 'Send a message… (Enter to send, Shift+Enter for newline)'}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="composer-actions">
        {status === 'running' && (
          <button type="button" className="cancel-btn" onClick={() => cancelSession()}>
            Cancel
          </button>
        )}
        <button type="button" className="send-btn" disabled={disabled || !text.trim()} onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}
