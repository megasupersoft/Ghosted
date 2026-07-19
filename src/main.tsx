import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// Re-establish main-process access to the persisted workspace before any
// component fires filesystem IPC, so restored panes don't race the grant.
async function boot() {
  const workspacePath = localStorage.getItem('ghosted:workspacePath')
  if (workspacePath) {
    try {
      const ok = await window.electron.workspace.restore(workspacePath)
      if (!ok) localStorage.removeItem('ghosted:workspacePath')
    } catch {}
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

boot()
