import React, { useEffect, useRef, useState } from 'react'
import 'xterm/css/xterm.css'
import { useStore } from '@/store'
import { useSettings } from '@/store/settings'

export default function TerminalPane({ leafId }: { leafId?: string }) {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const fitRef = useRef<any>(null)
  const ptyId = `term-${leafId ?? 'default'}`
  const workspacePath = useStore(s => s.workspacePath)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState('')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    const el = termRef.current
    if (!el) return

    let term: any
    let fit: any
    let ro: ResizeObserver
    let created = false
    let disposed = false

    const init = async () => {
      if (disposed) return
      try {
        const { Terminal } = await import('xterm')
        const { FitAddon } = await import('@xterm/addon-fit')
        const { WebLinksAddon } = await import('@xterm/addon-web-links')

        if (!mounted.current || disposed) return

        const s = useSettings.getState()
        term = new Terminal({
          fontFamily: s.terminalFontFamily,
          fontSize: s.terminalFontSize,
          lineHeight: s.terminalLineHeight,
          cursorBlink: s.terminalCursorBlink,
          cursorStyle: s.terminalCursorStyle,
          scrollback: s.terminalScrollback,
          theme: {
            background: '#252532',
            foreground: '#f0f0f5',
            cursor: '#b0a8f0',
            cursorAccent: '#252532',
            selectionBackground: '#40405a',
            black: '#2e2e3c',
            brightBlack: '#7e7e95',
            red: '#f87171',
            brightRed: '#fca5a5',
            green: '#4ade80',
            brightGreen: '#86efac',
            yellow: '#fbbf24',
            brightYellow: '#fcd34d',
            blue: '#8b7cf8',
            brightBlue: '#a99cff',
            magenta: '#c084fc',
            brightMagenta: '#d8b4fe',
            cyan: '#67e8f9',
            brightCyan: '#a5f3fc',
            white: '#e2e2f0',
            brightWhite: '#ffffff',
          },
        })

        fit = new FitAddon()
        term.loadAddon(fit)
        term.loadAddon(new WebLinksAddon((_, uri) => window.electron.shell.openExternal(uri)))

        term.open(el)

        xtermRef.current = term
        fitRef.current = fit

        // Wait a frame for the DOM to settle, then fit
        await new Promise(r => requestAnimationFrame(r))
        await new Promise(r => requestAnimationFrame(r))

        if (!mounted.current || disposed) { term.dispose(); return }

        fit.fit()
        const cols = term.cols || 80
        const rows = term.rows || 24
        const cwd = workspacePath || await window.electron.fs.homedir()

        // Connect PTY
        window.electron.pty.onData(ptyId, (d: string) => term.write(d))
        window.electron.pty.onExit(ptyId, () => term.write('\r\n\x1b[90m[exited]\x1b[0m\r\n'))

        // Retry PTY creation up to 3 times (handles race conditions on reload)
        let ok = false
        for (let attempt = 0; attempt < 3 && !ok && !disposed; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 500))
          ok = await window.electron.pty.create(ptyId, cwd, cols, rows)
        }

        if (disposed) { term.dispose(); return }
        if (!ok) {
          if (mounted.current) setErr('node-pty unavailable')
          term.write('\x1b[31m[node-pty unavailable — restart app]\x1b[0m\r\n')
          return
        }

        created = true
        term.onData((d: string) => window.electron.pty.write(ptyId, d))
        term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
          window.electron.pty.resize(ptyId, cols, rows)
        })

        term.focus()
        if (mounted.current) setReady(true)

        // Resize observer
        let timer: any
        ro = new ResizeObserver(() => {
          clearTimeout(timer)
          timer = setTimeout(() => {
            if (el.offsetWidth > 0 && el.offsetHeight > 0) {
              try { fit.fit() } catch {}
            }
          }, 60)
        })
        ro.observe(el)

      } catch (e: any) {
        if (mounted.current) setErr(e.message)
      }
    }

    init()

    return () => {
      disposed = true
      ro?.disconnect()
      if (created) {
        window.electron.pty.removeListeners(ptyId)
        window.electron.pty.kill(ptyId)
      }
      term?.dispose()
      xtermRef.current = null
      fitRef.current = null
    }
  }, [ptyId])

  // Re-focus terminal when pane becomes visible
  const focusedLeafId = useStore(s => s.focusedLeafId)
  useEffect(() => {
    if (focusedLeafId === leafId && xtermRef.current) {
      // Small delay to ensure the pane is visible (display:none → flex)
      requestAnimationFrame(() => xtermRef.current?.focus())
    }
  }, [focusedLeafId, leafId])

  // Sync settings
  const fontSize = useSettings(s => s.terminalFontSize)
  const fontFamily = useSettings(s => s.terminalFontFamily)
  const lineHeight = useSettings(s => s.terminalLineHeight)
  const cursorBlink = useSettings(s => s.terminalCursorBlink)
  const cursorStyle = useSettings(s => s.terminalCursorStyle)

  useEffect(() => {
    const t = xtermRef.current
    const f = fitRef.current
    if (!t || !f) return
    t.options.fontSize = fontSize
    t.options.fontFamily = fontFamily
    t.options.lineHeight = lineHeight
    t.options.cursorBlink = cursorBlink
    t.options.cursorStyle = cursorStyle
    try { f.fit() } catch {}
  }, [fontSize, fontFamily, lineHeight, cursorBlink, cursorStyle])

  return (
    <div
      onMouseDown={() => requestAnimationFrame(() => xtermRef.current?.focus())}
      style={{
        width: '100%', height: '100%',
        background: 'var(--bg-surface)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {err && (
        <div style={{ padding: 12, color: 'var(--red)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
          {err}
        </div>
      )}
      <div
        ref={termRef}
        style={{
          flex: 1,
          minHeight: 0,
          padding: '8px 0 0 12px',
        }}
      />
    </div>
  )
}
