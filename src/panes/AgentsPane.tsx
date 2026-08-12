/**
 * Agents pane — chat UI over the ACP (Agent Client Protocol) host. Ported
 * from the ghosted2 standalone MVP (ghosted2/src/components/*, store.ts) and
 * adapted to this app's conventions: inline styles + CSS variable tokens
 * (see AiPane.tsx for the baseline), always-mounted pane lifecycle, and the
 * shared `useAgentsStore` (src/store/agents.ts) instead of a WebSocket store.
 *
 * Left strip: agent picker (spawn a new session) + session list with status
 * chips. Main area: coalesced chat bubbles, latest plan checklist, tool-call
 * cards, inline permission cards, and a composer.
 */

import { Bot, Send, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { buildChatItems, statusColor } from '@/panes/agents/chatItems'
import PermissionCard from '@/panes/agents/PermissionCard'
import PlanCard from '@/panes/agents/PlanCard'
import { buildActivityLabels } from '@/panes/agents/sessionActivity'
import ToolCallCard from '@/panes/agents/ToolCallCard'
import { useAgentsStore } from '@/store/agents'
import type { PermissionMode, SessionStatus } from '@/types/acp'

const SCROLL_THRESHOLD = 80
const BUSY_STATUSES: SessionStatus[] = ['running', 'awaiting-permission', 'starting']

const PERMISSION_MODE_OPTIONS: { mode: PermissionMode; label: string }[] = [
  { mode: 'safe', label: 'Gated' },
  { mode: 'default', label: 'Default' },
  { mode: 'full', label: 'Full access' },
]

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

function StatusChip({ status }: { status: SessionStatus }) {
  return (
    <span
      className={status === 'running' ? 'ghost-pulse' : undefined}
      style={{
        fontSize: 10,
        color: statusColor(status),
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
    >
      {status}
    </span>
  )
}

function FullAccessBadge() {
  return (
    <span
      style={{
        fontSize: 10,
        color: 'var(--amber)',
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
    >
      FULL
    </span>
  )
}

function PermissionModeControl() {
  const defaultPermissionMode = useAgentsStore((s) => s.defaultPermissionMode)
  const setDefaultPermissionMode = useAgentsStore((s) => s.setDefaultPermissionMode)

  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        padding: 2,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
      }}
    >
      {PERMISSION_MODE_OPTIONS.map(({ mode, label }) => {
        const selected = defaultPermissionMode === mode
        const isFull = mode === 'full'
        return (
          <button
            key={mode}
            type="button"
            onClick={() => setDefaultPermissionMode(mode)}
            title={
              isFull
                ? 'Full access — the agent writes without asking'
                : mode === 'safe'
                  ? 'Gated — strictest permission gating'
                  : 'Default permission gating'
            }
            style={{
              flex: 1,
              padding: '4px 6px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              background: selected ? 'var(--bg-surface)' : 'transparent',
              color: selected ? (isFull ? 'var(--amber)' : 'var(--text-primary)') : 'var(--text-muted)',
              border: selected && isFull ? '1px solid var(--amber)' : '1px solid transparent',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function AgentsSidebar() {
  const agents = useAgentsStore((s) => s.agents)
  const sessions = useAgentsStore((s) => s.sessions)
  const selectedSessionId = useAgentsStore((s) => s.selectedSessionId)
  const select = useAgentsStore((s) => s.select)
  const newSession = useAgentsStore((s) => s.newSession)
  const updates = useAgentsStore((s) => s.updates)

  const activityLabels = useMemo(() => buildActivityLabels(updates), [updates])

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '10px 12px 6px', flexShrink: 0 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          New session
        </span>
      </div>
      <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
        <PermissionModeControl />
      </div>
      <div style={{ padding: '0 8px 10px', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        {agents.length === 0 && (
          <span style={{ padding: '4px 6px', fontSize: 12, color: 'var(--text-ghost)' }}>
            No agents available.
          </span>
        )}
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            disabled={!agent.available}
            title={agent.description ?? agent.name}
            onClick={() => void newSession(agent.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              color: agent.available ? 'var(--text-primary)' : 'var(--text-ghost)',
              textAlign: 'left',
              cursor: agent.available ? 'pointer' : 'default',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                flexShrink: 0,
                background: agent.available ? 'var(--green)' : 'var(--text-ghost)',
              }}
            />
            {agent.name}
          </button>
        ))}
      </div>

      <div style={{ padding: '10px 12px 6px', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Sessions
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 10px' }}>
        {sessions.length === 0 && (
          <span style={{ display: 'block', padding: '4px 6px', fontSize: 12, color: 'var(--text-ghost)' }}>
            No sessions yet.
          </span>
        )}
        {[...sessions].reverse().map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => select(session.id)}
            title={session.error ?? `${session.agentName} · ${session.cwd}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 2,
              width: '100%',
              padding: '6px 8px',
              marginBottom: 2,
              borderRadius: 'var(--radius-sm)',
              background: session.id === selectedSessionId ? 'var(--bg-elevated)' : 'transparent',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {session.agentName}
              </span>
              {session.permissionMode === 'full' && <FullAccessBadge />}
              <StatusChip status={session.status} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
              {shortId(session.id)}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {activityLabels.get(session.id) ?? '0 updates · 0 tools'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ChatArea() {
  const selectedSessionId = useAgentsStore((s) => s.selectedSessionId)
  const sessions = useAgentsStore((s) => s.sessions)
  const updates = useAgentsStore((s) => s.updates)
  const pendingPermissions = useAgentsStore((s) => s.pendingPermissions)
  const prompt = useAgentsStore((s) => s.prompt)
  const cancel = useAgentsStore((s) => s.cancel)

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [userScrolledUp, setUserScrolledUp] = useState(false)

  const session = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  )

  const sessionUpdates = useMemo(
    () => (selectedSessionId ? updates.filter((u) => u.sessionId === selectedSessionId) : []),
    [updates, selectedSessionId],
  )

  const items = useMemo(() => buildChatItems(sessionUpdates), [sessionUpdates])

  const sessionPermissions = useMemo(
    () => pendingPermissions.filter((p) => p.sessionId === selectedSessionId),
    [pendingPermissions, selectedSessionId],
  )

  // Snap to bottom on session switch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedSessionId is a re-run trigger, not read in the body
  useEffect(() => {
    setUserScrolledUp(false)
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [selectedSessionId])

  // Auto-scroll on new content unless the user has scrolled up ("hold").
  // biome-ignore lint/correctness/useExhaustiveDependencies: lengths are re-run triggers, not read in the body
  useEffect(() => {
    if (userScrolledUp) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items.length, sessionPermissions.length, userScrolledUp])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setUserScrolledUp(distanceFromBottom > SCROLL_THRESHOLD)
  }

  const busy = session ? BUSY_STATUSES.includes(session.status) : true

  const send = () => {
    const msg = input.trim()
    if (!msg || busy || !session) return
    setInput('')
    void prompt(msg)
  }

  if (!session) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <Bot size={64} color="var(--bg-base)" />
        <span style={{ fontSize: 14, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
          pick an agent to spawn a session
        </span>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {items.map((item) => {
          if (item.kind === 'bubble') {
            if (item.role === 'thought') {
              return (
                <div
                  key={item.key}
                  style={{
                    alignSelf: 'flex-start',
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'transparent',
                    border: '1px dashed var(--border)',
                    color: 'var(--text-muted)',
                    fontSize: 13,
                    fontStyle: 'italic',
                    lineHeight: 1.6,
                    fontFamily: 'var(--font-ui)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.text}
                </div>
              )
            }
            return (
              <div
                key={item.key}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: item.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  className="pi-msg-bubble"
                  style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: item.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: item.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: item.role === 'user' ? '#fff' : 'var(--text-primary)',
                    fontSize: 14,
                    lineHeight: 1.6,
                    fontFamily: 'var(--font-ui)',
                    wordBreak: 'break-word',
                  }}
                >
                  <ReactMarkdown>{item.text}</ReactMarkdown>
                </div>
              </div>
            )
          }
          if (item.kind === 'plan') return <PlanCard entries={item.entries} key={item.key} />
          if (item.kind === 'tool') return <ToolCallCard item={item} key={item.key} />
          return (
            <div
              key={item.key}
              style={{ fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}
            >
              {item.sessionUpdate}
            </div>
          )
        })}
        {sessionPermissions.map((req) => (
          <PermissionCard request={req} key={req.requestId} />
        ))}
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={
            busy ? 'Agent is busy…' : 'Message the agent… (Enter to send, Shift+Enter for newline)'
          }
          disabled={busy}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: 14,
            fontFamily: 'var(--font-ui)',
            lineHeight: 1.5,
            maxHeight: 120,
            overflowY: 'auto',
          }}
        />
        {session.status === 'running' ? (
          <button
            type="button"
            onClick={() => cancel()}
            title="Cancel"
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--red)',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            <Square size={12} />
          </button>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            title="Send"
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              background: !busy && input.trim() ? 'var(--accent)' : 'var(--bg-elevated)',
              color: !busy && input.trim() ? '#fff' : 'var(--text-muted)',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function AgentsPane() {
  const available = useAgentsStore((s) => s.available)
  const init = useAgentsStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  if (!available) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: 'var(--bg-surface)',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <Bot size={48} color="var(--bg-base)" />
        <span
          style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-ui)',
            maxWidth: 420,
          }}
        >
          Agent host not connected — on web run{' '}
          <code
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              background: 'var(--bg-elevated)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            cd ghosted2 && npm run dev:server
          </code>
          . Electron support coming next.
        </span>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--bg-surface)' }}>
      <AgentsSidebar />
      <ChatArea />
    </div>
  )
}
