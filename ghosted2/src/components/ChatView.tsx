import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { buildChatItems } from '../lib/chatItems';
import { useStore } from '../store';
import { Composer } from './Composer';
import { PermissionCard } from './PermissionCard';
import { PlanCard } from './PlanCard';
import { ToolCallCard } from './ToolCallCard';

const SCROLL_THRESHOLD = 80;

export function ChatView() {
  const selectedSessionId = useStore((s) => s.selectedSessionId);
  const sessions = useStore((s) => s.sessions);
  const updates = useStore((s) => s.updates);
  const pendingPermissions = useStore((s) => s.pendingPermissions);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const session = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  const sessionUpdates = useMemo(
    () => (selectedSessionId ? updates.filter((u) => u.sessionId === selectedSessionId) : []),
    [updates, selectedSessionId],
  );

  const items = useMemo(() => buildChatItems(sessionUpdates), [sessionUpdates]);

  const sessionPermissions = useMemo(
    () => pendingPermissions.filter((p) => p.sessionId === selectedSessionId),
    [pendingPermissions, selectedSessionId],
  );

  // Snap to bottom on session switch.
  useEffect(() => {
    setUserScrolledUp(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selectedSessionId]);

  // Auto-scroll on new content unless the user has scrolled up.
  useEffect(() => {
    if (userScrolledUp) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, sessionPermissions.length, userScrolledUp]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setUserScrolledUp(distanceFromBottom > SCROLL_THRESHOLD);
  }

  if (!session) {
    return (
      <div className="center-col">
        <div className="empty-state">No session selected — spawn an agent.</div>
      </div>
    );
  }

  return (
    <div className="center-col">
      <div className="chat-scroll" ref={scrollRef} onScroll={handleScroll}>
        {items.map((item) => {
          if (item.kind === 'bubble') {
            if (item.role === 'thought') {
              return (
                <div className="bubble bubble-thought" key={item.key}>
                  {item.text}
                </div>
              );
            }
            return (
              <div className={`bubble bubble-${item.role}`} key={item.key}>
                <ReactMarkdown>{item.text}</ReactMarkdown>
              </div>
            );
          }
          if (item.kind === 'plan') {
            return <PlanCard entries={item.entries} key={item.key} />;
          }
          if (item.kind === 'tool') {
            return <ToolCallCard item={item} key={item.key} />;
          }
          return (
            <div className="debug-row" key={item.key}>
              {item.sessionUpdate}
            </div>
          );
        })}
        {sessionPermissions.map((req) => (
          <PermissionCard request={req} key={req.requestId} />
        ))}
      </div>
      <Composer status={session.status} />
    </div>
  );
}
