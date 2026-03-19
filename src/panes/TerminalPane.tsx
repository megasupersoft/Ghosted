import React, { useEffect, useRef, useState } from 'react'
import 'xterm/css/xterm.css'
import { useStore } from '@/store'
import { useSettings } from '@/store/settings'

// Global registry — survives React unmount/remount cycles
interface TermSession {
  term: any
  fit: any
  wrapper: HTMLDivElement
  ro: ResizeObserver
}
const sessions = new Map<string, TermSession>()
const pendingKills = new Map<string, ReturnType<typeof setTimeout>>()

function killSession(key: string) {
  const s = sessions.get(key)
  if (s) {
    s.ro.disconnect()
    s.term.dispose()
    sessions.delete(key)
  }
  window.electron?.pty?.removeListeners(key)
  window.electron?.pty?.kill(key)
}

export default function TerminalPane({ leafId }: { leafId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sessionKey = `term-${leafId ?? 'default'}`
  const workspacePath = useStore(s => s.workspacePath)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Cancel any pending kill for this session (panel was moved)
    const pending = pendingKills.get(sessionKey)
    if (pending) {
      clearTimeout(pending)
      pendingKills.delete(sessionKey)
    }

    const existing = sessions.get(sessionKey)
    if (existing) {
      // Reattach
      container.appendChild(existing.wrapper)
      requestAnimationFrame(() => {
        existing.fit.fit()
        existing.term.focus()
      })
      return () => {
        if (existing.wrapper.parentNode === container) {
          container.removeChild(existing.wrapper)
        }
        // Grace period — kill only if not reattached within 2s
        pendingKills.set(sessionKey, setTimeout(() => {
          pendingKills.delete(sessionKey)
          killSession(sessionKey)
        }, 2000))
      }
    }

    // Create new session
    let cancelled = false

    ;(async () => {
      try {
        const { Terminal } = await import('xterm')
        const { FitAddon } = await import('@xterm/addon-fit')
        const { WebLinksAddon } = await import('@xterm/addon-web-links')
        if (cancelled) return

        const wrapper = document.createElement('div')
        wrapper.style.cssText = 'width:100%;height:100%;'
        container.appendChild(wrapper)

        const s = useSettings.getState()
        const term = new Terminal({
          fontFamily: s.terminalFontFamily,
          fontSize: s.terminalFontSize,
          lineHeight: s.terminalLineHeight,
          theme: {
            background: '#252532', foreground: '#f0f0f5',
            cursor: '#b0a8f0', cursorAccent: '#252532',
            selectionBackground: '#40405a',
            black: '#2e2e3c',  brightBlack: '#7e7e95',
            red: '#f87171',    brightRed: '#fca5a5',
            green: '#4ade80',  brightGreen: '#86efac',
            yellow: '#fbbf24', brightYellow: '#fcd34d',
            blue: '#8b7cf8',   brightBlue: '#a99cff',
            magenta: '#c084fc', brightMagenta: '#d8b4fe',
            cyan: '#67e8f9',   brightCyan: '#a5f3fc',
            white: '#e2e2f0',  brightWhite: '#ffffff',
          },
          cursorBlink: s.terminalCursorBlink,
          cursorStyle: s.terminalCursorStyle,
          scrollback: s.terminalScrollback,
          allowProposedApi: true,
        })

        const fit = new FitAddon()
        const links = new WebLinksAddon((_, uri) => window.electron.shell.openExternal(uri))
        term.loadAddon(fit)
        term.loadAddon(links)
        term.open(wrapper)
        fit.fit()

        if (cancelled) { term.dispose(); wrapper.remove(); return }

        const cols = term.cols
        const rows = term.rows
        const cwd = workspacePath ?? (await window.electron.fs.homedir())

        // Wire IPC listeners (removeAllListeners first to prevent stacking)
        window.electron.pty.onData(sessionKey, d => term.write(d))
        window.electron.pty.onExit(sessionKey, () => term.write('\r\n\x1b[35m[process exited]\x1b[0m\r\n'))

        const ok = await window.electron.pty.create(sessionKey, cwd, cols, rows)
        if (cancelled) { term.dispose(); wrapper.remove(); return }

        if (ok) {
          term.onData(d => window.electron.pty.write(sessionKey, d))
          term.onResize(({ cols, rows }) => window.electron.pty.resize(sessionKey, cols, rows))
        } else {
          term.write('\x1b[35m[node-pty unavailable]\x1b[0m\r\n')
        }

        term.focus()

        // Debounced resize
        let resizeTimer: ReturnType<typeof setTimeout>
        const ro = new ResizeObserver(() => {
          clearTimeout(resizeTimer)
          resizeTimer = setTimeout(() => fit.fit(), 50)
        })
        ro.observe(container)

        sessions.set(sessionKey, { term, fit, wrapper, ro })
      } catch (err: any) {
        if (!cancelled) setError(err.message)
      }
    })()

    return () => {
      cancelled = true
      const session = sessions.get(sessionKey)
      if (session) {
        if (session.wrapper.parentNode === container) {
          container.removeChild(session.wrapper)
        }
        pendingKills.set(sessionKey, setTimeout(() => {
          pendingKills.delete(sessionKey)
          killSession(sessionKey)
        }, 2000))
      }
    }
  }, [sessionKey])

  // cd to new workspace when project changes
  const prevWorkspace = useRef(workspacePath)
  useEffect(() => {
    if (!workspacePath || workspacePath === prevWorkspace.current) {
      prevWorkspace.current = workspacePath
      return
    }
    prevWorkspace.current = workspacePath
    const session = sessions.get(sessionKey)
    if (session) {
      const escaped = workspacePath.replace(/'/g, "'\\''")
      window.electron.pty.write(sessionKey, `cd '${escaped}'\n`)
    }
  }, [workspacePath, sessionKey])

  // Sync settings to live terminal
  const termFontSize = useSettings(s => s.terminalFontSize)
  const termFontFamily = useSettings(s => s.terminalFontFamily)
  const termLineHeight = useSettings(s => s.terminalLineHeight)
  const termCursorBlink = useSettings(s => s.terminalCursorBlink)
  const termCursorStyle = useSettings(s => s.terminalCursorStyle)

  useEffect(() => {
    const session = sessions.get(sessionKey)
    if (!session) return
    const { term, fit } = session
    term.options.fontSize = termFontSize
    term.options.fontFamily = termFontFamily
    term.options.lineHeight = termLineHeight
    term.options.cursorBlink = termCursorBlink
    term.options.cursorStyle = termCursorStyle
    fit.fit()
  }, [sessionKey, termFontSize, termFontFamily, termLineHeight, termCursorBlink, termCursorStyle])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}>
      {error && <div style={{ padding: 10, color: 'var(--red)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>error: {error}</div>}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', padding: '8px 0 8px 12px' }} />
    </div>
  )
}
