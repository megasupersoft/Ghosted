import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useStore } from '@/store'
import {
  GitBranch, GitCommitHorizontal, Undo2, Check,
  ChevronDown, ChevronRight, FileCode, FileText,
  File, RefreshCw, Sparkles, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'

interface GitFile {
  x: string
  y: string
  path: string
}

interface GitLogEntry {
  hash: string; shortHash: string; author: string; email: string
  date: string; subject: string; refs: string; parents: string[]
}

type FileCategory = 'staged' | 'changed' | 'untracked'

function categorize(f: GitFile): FileCategory {
  if (f.x !== ' ' && f.x !== '?' && f.x !== '!') return 'staged'
  if (f.y === '?') return 'untracked'
  return 'changed'
}

function statusLabel(x: string, y: string, cat: FileCategory): string {
  if (cat === 'staged') {
    if (x === 'A') return 'A'
    if (x === 'M') return 'M'
    if (x === 'D') return 'D'
    if (x === 'R') return 'R'
    return x.trim()
  }
  if (cat === 'untracked') return 'U'
  if (y === 'M') return 'M'
  if (y === 'D') return 'D'
  return y.trim()
}

function statusColor(label: string): string {
  switch (label) {
    case 'M': return 'var(--amber)'
    case 'A': case 'U': return 'var(--green)'
    case 'D': return 'var(--red)'
    case 'R': return 'var(--cyan)'
    default: return 'var(--text-muted)'
  }
}

function SmallFileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const sz = 14
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go'].includes(ext))
    return <FileCode size={sz} color="var(--text-muted)" style={{ flexShrink: 0 }} />
  if (['md', 'txt'].includes(ext))
    return <FileText size={sz} color="var(--text-muted)" style={{ flexShrink: 0 }} />
  return <File size={sz} color="var(--text-muted)" style={{ flexShrink: 0 }} />
}

function ChangesList({ files, cwd, onRefresh }: { files: GitFile[]; cwd: string; onRefresh: () => void }) {
  const [open, setOpen] = useState(true)
  if (files.length === 0) return null

  const handleDiscard = async (filePath: string) => {
    await window.electron.git.discard(cwd, filePath)
    onRefresh()
  }

  return (
    <div>
      <div onClick={() => setOpen(o => !o)} className="scm-group-header">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="scm-group-label">Changes</span>
        <span className="scm-group-count">{files.length}</span>
      </div>
      {open && files.map(file => {
        const name = file.path.split('/').pop() ?? file.path
        const cat = categorize(file)
        const sl = statusLabel(file.x, file.y, cat)
        return (
          <div key={file.path} className="scm-file-row">
            <SmallFileIcon name={name} />
            <span className="scm-file-name" title={file.path}>{name}</span>
            <span className="scm-file-path" title={file.path}>
              {file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''}
            </span>
            <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
              {cat === 'changed' && (
                <button className="scm-file-action" title="Discard changes" onClick={() => handleDiscard(file.path)}>
                  <Undo2 size={13} />
                </button>
              )}
              <span className="scm-file-status" style={{ color: statusColor(sl) }}>{sl}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Git Graph ──

// Bright colors for canvas (CSS vars don't work in canvas, use hex directly)
const LANE_COLORS = ['#a99cff', '#86efac', '#a5f3fc', '#fcd34d', '#d8b4fe', '#fca5a5']
const ROW_H = 28
const LANE_W = 16
const DOT_R = 3

function GitGraph({ commits, currentBranch }: { commits: GitLogEntry[]; currentBranch: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [open, setOpen] = useState(true)

  // Assign lanes to commits for the graph lines
  const lanes = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!canvasRef.current || !open || commits.length === 0) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Build lane assignments FIRST
    const laneMap = new Map<string, number>()
    const activeLanes: (string | null)[] = []

    const getLane = (hash: string): number => {
      if (laneMap.has(hash)) return laneMap.get(hash)!
      let lane = activeLanes.indexOf(null)
      if (lane === -1) { lane = activeLanes.length; activeLanes.push(null) }
      activeLanes[lane] = hash
      laneMap.set(hash, lane)
      return lane
    }

    for (const commit of commits) {
      const lane = getLane(commit.hash)
      if (activeLanes[lane] === commit.hash) activeLanes[lane] = null
      for (let i = 0; i < commit.parents.length; i++) {
        const p = commit.parents[i]
        if (!laneMap.has(p)) {
          if (i === 0) {
            activeLanes[lane] = p
            laneMap.set(p, lane)
          } else {
            getLane(p)
          }
        }
      }
    }

    lanes.current = laneMap

    // Size canvas based on actual lane count
    const dpr = window.devicePixelRatio || 1
    const maxLane = laneMap.size > 0 ? Math.max(...Array.from(laneMap.values())) : 0
    const graphCols = Math.min(6, maxLane + 1)
    const w = graphCols * LANE_W + 8
    canvas.width = w * dpr
    canvas.height = commits.length * ROW_H * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${commits.length * ROW_H}px`
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, commits.length * ROW_H)

    // Draw
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i]
      const lane = laneMap.get(commit.hash) ?? 0
      const x = lane * LANE_W + LANE_W / 2 + 4
      const y = i * ROW_H + ROW_H / 2
      const color = LANE_COLORS[lane % LANE_COLORS.length]

      // Draw lines to parents
      for (const parentHash of commit.parents) {
        const parentIdx = commits.findIndex(c => c.hash === parentHash)
        const parentLane = parentIdx !== -1 ? (laneMap.get(parentHash) ?? 0) : lane
        const px = parentLane * LANE_W + LANE_W / 2 + 4
        // If parent is beyond visible list, draw line to bottom of canvas
        const py = parentIdx !== -1 ? (parentIdx * ROW_H + ROW_H / 2) : (commits.length * ROW_H)
        const pColor = LANE_COLORS[parentLane % LANE_COLORS.length]

        ctx.beginPath()
        ctx.strokeStyle = pColor
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.7
        if (lane === parentLane) {
          ctx.moveTo(x, y)
          ctx.lineTo(px, py)
        } else {
          ctx.moveTo(x, y)
          ctx.bezierCurveTo(x, y + ROW_H, px, py - ROW_H, px, py)
        }
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Draw commit dot
      ctx.beginPath()
      ctx.fillStyle = color
      ctx.arc(x, y, DOT_R, 0, Math.PI * 2)
      ctx.fill()

      // Bright ring for HEAD
      if (commit.refs?.includes('HEAD')) {
        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.arc(x, y, DOT_R + 2, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }, [commits, open])

  if (commits.length === 0) return null

  return (
    <div>
      <div onClick={() => setOpen(o => !o)} className="scm-group-header">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="scm-group-label">Git Graph</span>
        <span className="scm-group-count">{commits.length}</span>
      </div>
      {open && (
        <div style={{ position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 0 }}
          />
          {commits.map((c, i) => {
            const maxLane = lanes.current.size > 0 ? Math.max(...Array.from(lanes.current.values())) : 0
            const graphW = Math.min(6, maxLane + 1) * LANE_W + 8
            const refs = c.refs ? c.refs.split(',').map(r => r.trim()).filter(Boolean) : []
            return (
              <div key={c.hash} className="scm-graph-row" style={{ height: ROW_H, position: 'relative', zIndex: 1 }}>
                <div style={{ width: graphW, flexShrink: 0 }} />
                <div className="scm-graph-info">
                  {refs.length > 0 && refs.map(r => (
                    <span key={r} className="scm-graph-ref" style={{
                      background: r.includes('HEAD') ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                      color: r.includes('HEAD') ? 'var(--accent-bright)' : 'var(--text-muted)',
                    }}>{r.replace('HEAD -> ', '')}</span>
                  ))}
                  <span className="scm-graph-subject">{c.subject}</span>
                  <span className="scm-graph-meta">{c.shortHash} · {c.author} · {c.date}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main panel ──

export default function SourceControlPane() {
  const { workspacePath } = useStore()
  const [files, setFiles] = useState<GitFile[]>([])
  const [branch, setBranch] = useState('')
  const [commits, setCommits] = useState<GitLogEntry[]>([])
  const [commitMsg, setCommitMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [ahead, setAhead] = useState(0)
  const [behind, setBehind] = useState(0)

  const refresh = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    const [status, br, log, ab] = await Promise.all([
      window.electron.git.status(workspacePath),
      window.electron.git.branch(workspacePath),
      window.electron.git.log(workspacePath, 50),
      window.electron.git.aheadBehind(workspacePath),
    ])
    setFiles(status)
    setBranch(br)
    setCommits(log)
    setAhead(ab.ahead)
    setBehind(ab.behind)
    setLoading(false)
  }, [workspacePath])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!workspacePath) return
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [workspacePath, refresh])


  const handleCommit = async () => {
    if (!workspacePath || !commitMsg.trim()) return
    // Always stage all — matches VS Code behavior, avoids stale state issues
    await window.electron.git.stageAll(workspacePath)
    const result = await window.electron.git.commit(workspacePath, commitMsg.trim())
    if (result.ok) {
      useStore.getState().addStatus('info', `Committed: ${commitMsg.trim()}`)
      setCommitMsg('')
    } else {
      useStore.getState().addStatus('error', `Commit failed: ${result.error ?? 'unknown error'}`)
    }
    refresh()
  }

  const handleSync = async () => {
    if (!workspacePath || syncing) return
    setSyncing(true)
    useStore.getState().addStatus('info', 'Syncing...')
    // Pull first, then push
    if (behind > 0) {
      const pullResult = await window.electron.git.pull(workspacePath)
      if (!pullResult.ok) {
        useStore.getState().addStatus('error', `Pull failed: ${pullResult.error}`)
        setSyncing(false)
        refresh()
        return
      }
    }
    const pushResult = await window.electron.git.push(workspacePath)
    if (pushResult.ok) {
      useStore.getState().addStatus('info', 'Synced successfully')
    } else {
      useStore.getState().addStatus('error', `Push failed: ${pushResult.error}`)
    }
    setSyncing(false)
    refresh()
  }

  const handlePush = async () => {
    if (!workspacePath) return
    useStore.getState().addStatus('info', 'Pushing...')
    const result = await window.electron.git.push(workspacePath)
    if (result.ok) {
      useStore.getState().addStatus('info', 'Pushed successfully')
    } else {
      useStore.getState().addStatus('error', `Push failed: ${result.error}`)
    }
    refresh()
  }

  const handlePull = async () => {
    if (!workspacePath) return
    useStore.getState().addStatus('info', 'Pulling...')
    const result = await window.electron.git.pull(workspacePath)
    if (result.ok) {
      useStore.getState().addStatus('info', 'Pulled successfully')
    } else {
      useStore.getState().addStatus('error', `Pull failed: ${result.error}`)
    }
    refresh()
  }

  const generateCommitMsg = async () => {
    if (!workspacePath || generating) return
    setGenerating(true)
    try {
      const { diff, untracked: untrackedFiles } = await window.electron.git.diffSummary(workspacePath)
      // Parse the diff stat to understand what changed
      const lines = diff.split('\n').filter(Boolean)
      const changedFiles: { name: string; added: number; removed: number }[] = []
      for (const line of lines) {
        const match = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s+(\+*)(-*)/)
        if (match) changedFiles.push({ name: match[1].trim(), added: match[3].length, removed: match[4].length })
      }
      const newFiles = untrackedFiles.split('\n').filter(Boolean)

      // Determine the type of change
      const allFiles = [...changedFiles.map(f => f.name), ...newFiles]
      if (allFiles.length === 0) { setGenerating(false); return }

      // Detect common patterns
      const totalAdded = changedFiles.reduce((s, f) => s + f.added, 0)
      const totalRemoved = changedFiles.reduce((s, f) => s + f.removed, 0)
      const hasNew = newFiles.length > 0
      const hasModified = changedFiles.length > 0

      // Find common directory or file type
      const extensions = allFiles.map(f => f.split('.').pop()?.toLowerCase()).filter(Boolean)
      const uniqueExts = [...new Set(extensions)]
      const dirs = allFiles.map(f => f.split('/')[0]).filter(Boolean)
      const uniqueDirs = [...new Set(dirs)]

      // Build a conventional commit message
      let type = 'chore'
      if (hasNew && !hasModified) type = 'feat'
      else if (totalRemoved > totalAdded * 2) type = 'refactor'
      else if (uniqueExts.length === 1 && uniqueExts[0] === 'md') type = 'docs'
      else if (uniqueExts.some(e => e === 'test' || e === 'spec') || allFiles.some(f => f.includes('test') || f.includes('spec'))) type = 'test'
      else if (allFiles.some(f => f.includes('.css') || f.includes('style'))) type = 'style'
      else if (totalAdded > totalRemoved) type = 'feat'
      else type = 'fix'

      // Scope from common directory
      const scope = uniqueDirs.length === 1 && uniqueDirs[0] !== '.' ? uniqueDirs[0] : ''

      // Summary
      let summary = ''
      if (allFiles.length === 1) {
        const name = allFiles[0].split('/').pop()
        summary = hasNew && newFiles.length === 1 ? `add ${name}` : `update ${name}`
      } else if (uniqueDirs.length === 1) {
        summary = `update ${allFiles.length} files in ${uniqueDirs[0]}`
      } else {
        summary = `update ${allFiles.length} files across ${uniqueDirs.length} directories`
      }

      const msg = scope ? `${type}(${scope}): ${summary}` : `${type}: ${summary}`
      setCommitMsg(msg)
    } catch {}
    setGenerating(false)
  }

  if (!workspacePath) {
    return (
      <div className="scm-panel">
        <div style={{ padding: 16, color: 'var(--text-ghost)', fontSize: 13, textAlign: 'center' }}>
          Open a workspace to use source control.
        </div>
      </div>
    )
  }

  const totalChanges = files.length

  return (
    <div className="scm-panel">
      {/* Commit input */}
      <div className="scm-commit-area">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <GitBranch size={14} color="var(--accent)" />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{branch || '...'}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button onClick={handlePull} title="Pull" style={{ display: 'flex', color: 'var(--text-muted)' }}>
              <ArrowDown size={14} />
            </button>
            <button onClick={handlePush} title="Push" style={{ display: 'flex', color: 'var(--text-muted)' }}>
              <ArrowUp size={14} />
            </button>
            <button onClick={refresh} title="Refresh" style={{ display: 'flex', color: 'var(--text-muted)' }}>
              <RefreshCw size={14} className={loading ? 'ghost-pulse' : ''} />
            </button>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommit() } }}
            placeholder="Commit message"
            style={{ flex: 1 }}
          />
          <button
            onClick={generateCommitMsg}
            disabled={totalChanges === 0 || generating}
            title="Auto-generate commit message"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, borderRadius: 'var(--radius-sm)',
              color: generating ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}
          >
            <Sparkles size={14} className={generating ? 'ghost-pulse' : ''} />
          </button>
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim() || totalChanges === 0}
            title="Commit all changes"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, borderRadius: 'var(--radius-sm)',
              background: commitMsg.trim() && totalChanges > 0 ? 'var(--accent)' : 'var(--bg-elevated)',
              color: commitMsg.trim() && totalChanges > 0 ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            <Check size={14} />
          </button>
        </div>
        {(ahead > 0 || behind > 0) && (
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', marginTop: 6, padding: '5px 0',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)', color: '#fff',
              fontSize: 12, opacity: syncing ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            <ArrowUpDown size={13} />
            {syncing ? 'Syncing...' : `Sync Changes ${ahead > 0 ? `${ahead}\u2191` : ''}${behind > 0 ? `${behind}\u2193` : ''}`}
          </button>
        )}
      </div>

      {/* File lists + graph */}
      <div className="scm-file-list">
        <ChangesList files={files} cwd={workspacePath} onRefresh={refresh} />
        {files.length === 0 && !loading && commits.length === 0 && (
          <div style={{ padding: '20px 12px', color: 'var(--text-ghost)', fontSize: 13, textAlign: 'center' }}>
            No changes detected.
          </div>
        )}
        <GitGraph commits={commits} currentBranch={branch} />
      </div>
    </div>
  )
}
