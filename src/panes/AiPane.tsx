import React, { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { useStore } from '@/store'
import { Ghost, Send, Square, RotateCcw } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export default function AiPane({ leafId }: { leafId?: string }) {
  const workspacePath = useStore(s => s.workspacePath)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [ready, setReady] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionId = useRef(`pi-${leafId ?? 'default'}`)
  const abortRef = useRef(false)
  const historyIdx = useRef(-1)
  const draftRef = useRef('')

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamText])

  // Create Pi session via IPC (runs in main process)
  useEffect(() => {
    let cancelled = false
    const id = sessionId.current

    ;(async () => {
      const result = await window.electron.pi.create(id, workspacePath ?? undefined)
      if (cancelled) return

      if (!result.ok) {
        setMessages([{
          role: 'assistant',
          content: `Pi SDK error: ${result.error}`,
          timestamp: Date.now(),
        }])
        return
      }

      // Listen for events from main process
      window.electron.pi.onEvent(id, (event: any) => {
        if (abortRef.current) return
        switch (event.type) {
          case 'message_update':
            if (event.assistantMessageEvent?.type === 'text_delta') {
              setStreamText(prev => prev + event.assistantMessageEvent.delta)
            }
            break
          case 'agent_end':
            setStreaming(false)
            setStreamText(prev => {
              if (prev) {
                setMessages(msgs => [...msgs, { role: 'assistant', content: prev, timestamp: Date.now() }])
              }
              return ''
            })
            break
          case 'tool_execution_start':
            setStreamText(prev => prev + `\n⚡ ${event.toolName}\n`)
            break
        }
      })

      setReady(true)
    })()

    return () => {
      cancelled = true
      window.electron.pi.removeListeners(id)
      window.electron.pi.dispose(id)
    }
  }, [workspacePath])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || streaming || !ready) return

    historyIdx.current = -1
    draftRef.current = ''
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: Date.now() }])
    setStreaming(true)
    setStreamText('')
    abortRef.current = false

    const result = await window.electron.pi.prompt(sessionId.current, msg)
    if (!result.ok) {
      setStreaming(false)
      setStreamText('')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${result.error}`,
        timestamp: Date.now(),
      }])
    }
  }, [input, streaming, ready])

  const handleAbort = useCallback(() => {
    abortRef.current = true
    window.electron.pi.abort(sessionId.current)
    setStreaming(false)
    if (streamText) {
      setMessages(prev => [...prev, { role: 'assistant', content: streamText + '\n\n*[stopped]*', timestamp: Date.now() }])
      setStreamText('')
    }
  }, [streamText])

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-surface)',
    }}>
      <div
        ref={scrollRef}
        style={{
          flex: 1, minHeight: 0,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        {messages.length === 0 && !streaming && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16,
          }}>
            <Ghost size={64} color="var(--bg-base)" />
            <span style={{ fontSize: 16, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
              ask pi anything
            </span>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            flexDirection: 'column',
          }}>
            <div className="pi-msg-bubble" style={{
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
              color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
              fontSize: 14, lineHeight: 1.6,
              fontFamily: 'var(--font-ui)',
              wordBreak: 'break-word',
            }}>
              {msg.role === 'user'
                ? msg.content
                : <ReactMarkdown>{msg.content}</ReactMarkdown>
              }
            </div>
          </div>
        ))}

        {streaming && (
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div className="pi-msg-bubble" style={{
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: '12px 12px 12px 4px',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 14, lineHeight: 1.6,
              fontFamily: 'var(--font-ui)',
              wordBreak: 'break-word',
            }}>
              {streamText
                ? <ReactMarkdown>{streamText}</ReactMarkdown>
                : <span style={{ color: 'var(--text-muted)' }} className="ghost-pulse">thinking...</span>
              }
            </div>
          </div>
        )}
      </div>

      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <button
          onClick={() => { setMessages([]); setStreamText('') }}
          title="Clear"
          style={{
            width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', flexShrink: 0,
          }}
        >
          <RotateCcw size={14} />
        </button>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); return }
            const userMsgs = messages.filter(m => m.role === 'user')
            if (e.key === 'ArrowUp' && !e.shiftKey && (input === '' || historyIdx.current >= 0)) {
              e.preventDefault()
              if (historyIdx.current < 0) draftRef.current = input
              const next = Math.min(historyIdx.current + 1, userMsgs.length - 1)
              if (next === historyIdx.current) return
              historyIdx.current = next
              setInput(userMsgs[userMsgs.length - 1 - next].content)
            } else if (e.key === 'ArrowDown' && !e.shiftKey && historyIdx.current >= 0) {
              e.preventDefault()
              const next = historyIdx.current - 1
              if (next < 0) { historyIdx.current = -1; setInput(draftRef.current); return }
              historyIdx.current = next
              setInput(userMsgs[userMsgs.length - 1 - next].content)
            }
          }}
          placeholder="Ask pi..."
          rows={1}
          style={{
            flex: 1, resize: 'none',
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: 14, fontFamily: 'var(--font-ui)',
            lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
          }}
        />
        {streaming ? (
          <button
            onClick={handleAbort}
            title="Stop"
            style={{
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--red)', color: '#fff', flexShrink: 0,
            }}
          >
            <Square size={12} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            title="Send"
            style={{
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              background: input.trim() ? 'var(--accent)' : 'var(--bg-elevated)',
              color: input.trim() ? '#fff' : 'var(--text-muted)',
              flexShrink: 0, transition: 'all 0.15s',
            }}
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
