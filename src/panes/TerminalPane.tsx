import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'

let termIdCounter = 0

export default function TerminalPane() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<any>(null)
  const fitRef = useRef<any>(null)
  const termId = useRef(`term-${++termIdCounter}`)
  const { workspacePath } = useStore()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const init = async () => {
      try {
        const { Terminal } = await import('xterm')
        const { FitAddon } = await import('@xterm/addon-fit')
        const { WebLinksAddon } = await import('@xterm/addon-web-links')
        if (!mounted || !containerRef.current) return

        const term = new Terminal({
          fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
          fontSize: 13, lineHeight: 1.45,
          theme: {
            background: '#09090e', foreground: '#e2e2f0',
            cursor: '#8b7cf8', cursorAccent: '#09090e',
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
        })
        const fit = new FitAddon()
        const links = new WebLinksAddon((e, uri) => window.electron.shell.openExternal(uri))
        term.loadAddon(fit); term.loadAddon(links)
        term.open(containerRef.current); fit.fit()
        termRef.current = term; fitRef.current = fit

        const cwd = workspacePath ?? (await window.electron.fs.homedir())
        const ok = await window.electron.pty.create(termId.current, cwd)
        if (ok) {
          window.electron.pty.onData(termId.current, d => term.write(d))
          window.electron.pty.onExit(termId.current, () => term.write('\r\n\x1b[35m[process exited]\x1b[0m\r\n'))
          term.onData(d => window.electron.pty.write(termId.current, d))
          term.onResize(({ cols, rows }) => window.electron.pty.resize(termId.current, cols, rows))
        } else {
          term.write('\x1b[35m[node-pty unavailable — attach a real process to activate]\x1b[0m\r\n$ ')
        }
        const ro = new ResizeObserver(() => fit.fit())
        if (containerRef.current) ro.observe(containerRef.current)
        return () => ro.disconnect()
      } catch (err: any) { setError(err.message) }
    }
    init()
    return () => { mounted = false; window.electron?.pty?.kill(termId.current); termRef.current?.dispose() }
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <div style={{ padding: '0 12px', height: 30, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 8 }}>
        <span style={{ color: 'var(--accent)', fontSize: 9 }} className="ghost-pulse">●</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          {workspacePath?.split('/').pop() ?? 'terminal'}
        </span>
      </div>
      {error && <div style={{ padding: 10, color: 'var(--red)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>error: {error}</div>}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', padding: '2px 0' }} />
    </div>
  )
}
