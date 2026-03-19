import React, { useEffect, useRef, useState, useCallback } from 'react'
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sessionRef = useRef<any>(null)
  const abortRef = useRef(false)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamText])

  // Initialize pi session
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { createAgentSession, AuthStorage, ModelRegistry, SessionManager } =
          await import('@mariozechner/pi-coding-agent')
        if (cancelled) return

        const authStorage = AuthStorage.create()
        const modelRegistry = new ModelRegistry(authStorage)

        const { session } = await createAgentSession({
          sessionManager: SessionManager.inMemory(),
          authStorage,
          modelRegistry,
          cwd: workspacePath ?? undefined,
        })

        session.subscribe((event: any) => {
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
              setStreamText(prev => prev + `\n\`⚡ ${event.toolName}\`\n`)
              break
          }
        })

        sessionRef.current = session
      } catch (err: any) {
        console.error('Pi SDK init failed:', err)
        // Fallback message
        setMessages([{
          role: 'assistant',
          content: 'Pi SDK not available. Set up API keys with `pi auth` in your terminal.',
          timestamp: Date.now(),
        }])
      }
    })()
    return () => { cancelled = true }
  }, [workspacePath])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || streaming || !sessionRef.current) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: Date.now() }])
    setStreaming(true)
    setStreamText('')
    abortRef.current = false

    try {
      await sessionRef.current.prompt(msg)
    } catch (err: any) {
      setStreaming(false)
      setStreamText('')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: Date.now(),
      }])
    }
  }, [input, streaming])

  const handleAbort = useCallback(() => {
    if (sessionRef.current) {
      abortRef.current = true
      try { sessionRef.current.abort() } catch {}
      setStreaming(false)
      if (streamText) {
        setMessages(prev => [...prev, { role: 'assistant', content: streamText + '\n\n*[aborted]*', timestamp: Date.now() }])
        setStreamText('')
      }
    }
  }, [streamText])

  const handleClear = useCallback(() => {
    setMessages([])
    setStreamText('')
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-surface)',
    }}>
      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, minHeight: 0,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: 16,
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
            display: 'flex', flexDirection: 'column', gap: 4,
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
              color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
              fontSize: 14, lineHeight: 1.6,
              fontFamily: 'var(--font-ui)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {streaming && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            alignItems: 'flex-start',
          }}>
            <div style={{
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: '12px 12px 12px 4px',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 14, lineHeight: 1.6,
              fontFamily: 'var(--font-ui)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {streamText || (
                <span style={{ color: 'var(--text-muted)' }}>
                  <span className="ghost-pulse">thinking...</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <button
          onClick={handleClear}
          title="Clear chat"
          style={{
            width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          <RotateCcw size={14} />
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
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
            lineHeight: 1.5,
            maxHeight: 120, overflowY: 'auto',
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
              background: 'var(--red)', color: '#fff',
              flexShrink: 0,
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
