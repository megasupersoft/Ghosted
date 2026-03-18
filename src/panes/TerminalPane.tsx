import React, { useEffect, useRef, useState } from 'react'
import 'xterm/css/xterm.css'
import { useStore } from '@/store'

// ── Global terminal session registry ──
// Keeps PTY + xterm alive across panel moves (unmount → remount with same leafId)
interface TermSession {
  term: any
  fit: any
  ptyId: string
  wrapper: HTMLDivElement // the div xterm rendered into
  killTimer?: ReturnType<typeof setTimeout>
}
const sessions = new Map<string, TermSession>()

export default function TerminalPane({ leafId }: { leafId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sessionKey = `term-${leafId ?? 'default'}`
  const { workspacePath } = useStore()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    const existing = sessions.get(sessionKey)
    if (existing) {
      // Reattach existing terminal — cancel any pending kill
      if (existing.killTimer) {
        clearTimeout(existing.killTimer)
        existing.killTimer = undefined
      }
      container.appendChild(existing.wrapper)
      existing.fit.fit()
      existing.term.focus()
      return () => {
        // On unmount, start grace period — don't kill immediately
        existing.killTimer = setTimeout(() => {
          window.electron?.pty?.kill(existing.ptyId)
          existing.term.dispose()
          sessions.delete(sessionKey)
        }, 2000)
        // Detach DOM but don't destroy
        if (existing.wrapper.parentNode === container) {
          container.removeChild(existing.wrapper)
        }
      }
    }

    // ── Create new terminal session ──
    let mounted = true
    const init = async () => {
      try {
        const { Terminal } = await import('xterm')
        const { FitAddon } = await import('@xterm/addon-fit')
        const { WebLinksAddon } = await import('@xterm/addon-web-links')
        if (!mounted || !container) return

        // Create a wrapper div for xterm to render into (we'll reparent this on moves)
        const wrapper = document.createElement('div')
        wrapper.style.cssText = 'width:100%;height:100%;'
        container.appendChild(wrapper)

        const term = new Terminal({
          fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
          fontSize: 14, lineHeight: 1.45,
          theme: {
            background: '#0e0e16', foreground: '#e2e2f0',
            cursor: '#8b7cf8', cursorAccent: '#0e0e16',
            selectionBackground: '#1e1e35',
            black: '#14141f',  brightBlack: '#404060',
            red: '#f87171',    brightRed: '#fca5a5',
            green: '#4ade80',  brightGreen: '#86efac',
            yellow: '#fbbf24', brightYellow: '#fcd34d',
            blue: '#8b7cf8',   brightBlue: '#a99cff',
            magenta: '#c084fc', brightMagenta: '#d8b4fe',
            cyan: '#67e8f9',   brightCyan: '#a5f3fc',
            white: '#e2e2f0',  brightWhite: '#ffffff',
          },
          cursorBlink: true, scrollback: 5000,
          allowProposedApi: true,
        })
        const fit = new FitAddon()
        const links = new WebLinksAddon((e, uri) => window.electron.shell.openExternal(uri))
        term.loadAddon(fit); term.loadAddon(links)
        term.open(wrapper); fit.fit()

        const cols = term.cols
        const rows = term.rows

        const cwd = workspacePath ?? (await window.electron.fs.homedir())
        // Wire up listeners BEFORE creating PTY so we don't miss the initial prompt
        window.electron.pty.onData(sessionKey, d => term.write(d))
        window.electron.pty.onExit(sessionKey, () => term.write('\r\n\x1b[35m[process exited]\x1b[0m\r\n'))
        const ok = await window.electron.pty.create(sessionKey, cwd, cols, rows)
        if (ok) {
          term.onData(d => window.electron.pty.write(sessionKey, d))
          term.onResize(({ cols, rows }) => window.electron.pty.resize(sessionKey, cols, rows))
        } else {
          term.write('\x1b[35m[node-pty unavailable — attach a real process to activate]\x1b[0m\r\n$ ')
        }

        term.focus()

        // Debounce resize observer
        let resizeTimer: ReturnType<typeof setTimeout>
        const ro = new ResizeObserver(() => {
          clearTimeout(resizeTimer)
          resizeTimer = setTimeout(() => fit.fit(), 50)
        })
        ro.observe(container)

        // Register session
        const session: TermSession = { term, fit, ptyId: sessionKey, wrapper }
        sessions.set(sessionKey, session)

        // Cleanup ref for the ResizeObserver only
        return () => { clearTimeout(resizeTimer); ro.disconnect() }
      } catch (err: any) { setError(err.message) }
    }

    let roCleanup: (() => void) | undefined
    init().then(cleanup => { roCleanup = cleanup })

    return () => {
      mounted = false
      roCleanup?.()
      const session = sessions.get(sessionKey)
      if (session) {
        // Grace period — if remounted with same key within 2s, terminal survives
        session.killTimer = setTimeout(() => {
          window.electron?.pty?.kill(session.ptyId)
          session.term.dispose()
          sessions.delete(sessionKey)
        }, 2000)
        // Detach DOM
        if (session.wrapper.parentNode === container) {
          container.removeChild(session.wrapper)
        }
      }
    }
  }, [sessionKey])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}>
      {error && <div style={{ padding: 10, color: 'var(--red)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>error: {error}</div>}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', padding: '8px 0 8px 12px' }} />
    </div>
  )
}
