import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/global.css'

// Re-establish main-process access to the persisted workspace before any
// component fires filesystem IPC, so restored panes don't race the grant.
// A workspace handed over by the CLI launcher (`ghosted .`) wins over the
// previously persisted one.
//
// The App (and therefore the Zustand store) is imported dynamically AFTER this
// setup: the store snapshots localStorage at module-evaluation time, so it must
// not load until the workspace key is final.
async function boot() {
  try {
    const cliWorkspace = await window.electron.workspace.initial()
    if (cliWorkspace) localStorage.setItem('ghosted:workspacePath', cliWorkspace)
  } catch {}

  const workspacePath = localStorage.getItem('ghosted:workspacePath')
  if (workspacePath) {
    try {
      const ok = await window.electron.workspace.restore(workspacePath)
      if (!ok) localStorage.removeItem('ghosted:workspacePath')
    } catch {}
  }

  const { default: App } = await import('./App')

  const root = document.getElementById('root')
  if (!root) throw new Error('#root element missing from index.html')
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

boot()
