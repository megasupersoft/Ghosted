import React, { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { GitBranch, AlertTriangle, Info, AlertCircle } from 'lucide-react'

export default function StatusBar() {
  const { workspacePath, openFiles, activeFilePath, statusMessages } = useStore()
  const [branch, setBranch] = useState('')

  useEffect(() => {
    if (!workspacePath) { setBranch(''); return }
    window.electron.git.branch(workspacePath).then(setBranch).catch(() => setBranch(''))
    const id = setInterval(() => {
      window.electron.git.branch(workspacePath).then(setBranch).catch(() => setBranch(''))
    }, 5000)
    return () => clearInterval(id)
  }, [workspacePath])

  const activeFile = openFiles.find(f => f.path === activeFilePath)
  const lastMsg = statusMessages[statusMessages.length - 1]
  const errors = statusMessages.filter(m => m.level === 'error').length
  const warnings = statusMessages.filter(m => m.level === 'warn').length

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {branch && (
          <span className="status-bar-item">
            <GitBranch size={12} />
            {branch}
          </span>
        )}
      </div>
      <div className="status-bar-center">
        {lastMsg && (
          <span className="status-bar-item" style={{
            color: lastMsg.level === 'error' ? 'var(--red)' : lastMsg.level === 'warn' ? 'var(--amber)' : 'var(--text-muted)'
          }}>
            {lastMsg.level === 'error' && <AlertCircle size={12} />}
            {lastMsg.level === 'warn' && <AlertTriangle size={12} />}
            {lastMsg.level === 'info' && <Info size={12} />}
            {lastMsg.text}
          </span>
        )}
      </div>
      <div className="status-bar-right">
        {(errors > 0 || warnings > 0) && (
          <span className="status-bar-item">
            {errors > 0 && <span style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 3 }}><AlertCircle size={12} />{errors}</span>}
            {warnings > 0 && <span style={{ color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={12} />{warnings}</span>}
          </span>
        )}
        {activeFile && activeFile.fileType === 'text' && (
          <span className="status-bar-item">
            {getLang(activeFile.name)}
          </span>
        )}
        <span className="status-bar-item" style={{ color: 'var(--text-ghost)' }}>
          v0.1.0
        </span>
      </div>
    </div>
  )
}

function getLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript JSX', js: 'JavaScript', jsx: 'JavaScript JSX',
    py: 'Python', rs: 'Rust', go: 'Go', md: 'Markdown',
    json: 'JSON', css: 'CSS', html: 'HTML', sh: 'Shell',
    yaml: 'YAML', yml: 'YAML', toml: 'TOML',
  }
  return map[ext] ?? (ext.toUpperCase() || 'Plain Text')
}
