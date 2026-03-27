import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  fs: {
    readdir: (p: string) => ipcRenderer.invoke('fs:readdir', p),
    readfile: (p: string) => ipcRenderer.invoke('fs:readfile', p),
    writefile: (p: string, c: string) => ipcRenderer.invoke('fs:writefile', p, c),
    homedir: () => ipcRenderer.invoke('fs:homedir'),
    mkdir: (p: string) => ipcRenderer.invoke('fs:mkdir', p),
    newfile: (p: string, c?: string) => ipcRenderer.invoke('fs:newfile', p, c),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    delete: (p: string) => ipcRenderer.invoke('fs:delete', p),
    copy: (src: string, dest: string) => ipcRenderer.invoke('fs:copy', src, dest),
    exists: (p: string) => ipcRenderer.invoke('fs:exists', p),
    stat: (p: string) => ipcRenderer.invoke('fs:stat', p),
    watch: (p: string) => ipcRenderer.invoke('fs:watch', p),
    unwatch: (p: string) => ipcRenderer.invoke('fs:unwatch', p),
    onChanged: (cb: (event: { dir: string; eventType: string; filename: string }) => void) => {
      const handler = (_e: any, event: any) => cb(event)
      ipcRenderer.on('fs:changed', handler)
      return handler
    },
    offChanged: (handler?: any) => {
      if (handler) ipcRenderer.removeListener('fs:changed', handler)
      else ipcRenderer.removeAllListeners('fs:changed')
    },
  },
  pty: {
    create: (id: string, cwd: string, cols?: number, rows?: number) => ipcRenderer.invoke('pty:create', id, cwd, cols, rows),
    write: (id: string, data: string) => ipcRenderer.invoke('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('pty:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('pty:kill', id),
    onData: (id: string, cb: (d: string) => void) => {
      const channel = `pty:data:${id}`
      ipcRenderer.removeAllListeners(channel)
      ipcRenderer.on(channel, (_e, d) => cb(d))
    },
    onExit: (id: string, cb: () => void) => {
      const channel = `pty:exit:${id}`
      ipcRenderer.removeAllListeners(channel)
      ipcRenderer.on(channel, cb)
    },
    removeListeners: (id: string) => {
      ipcRenderer.removeAllListeners(`pty:data:${id}`)
      ipcRenderer.removeAllListeners(`pty:exit:${id}`)
    },
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (fullPath: string) => ipcRenderer.invoke('shell:showItemInFolder', fullPath),
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  },
  db: {
    index:   (workspacePath: string) => ipcRenderer.invoke('db:index', workspacePath),
    query:   (q: unknown)            => ipcRenderer.invoke('db:query', q),
    get:     (filePath: string)      => ipcRenderer.invoke('db:get', filePath),
    stats:   ()                      => ipcRenderer.invoke('db:stats'),
    onChange: (cb: (stats: unknown) => void) => {
      ipcRenderer.removeAllListeners('db:changed')
      ipcRenderer.on('db:changed', (_e, stats) => cb(stats))
    },
    offChange: () => ipcRenderer.removeAllListeners('db:changed'),
  },
  pi: {
    create: (sessionId: string, cwd?: string) => ipcRenderer.invoke('pi:create', sessionId, cwd),
    prompt: (sessionId: string, message: string) => ipcRenderer.invoke('pi:prompt', sessionId, message),
    abort: (sessionId: string) => ipcRenderer.invoke('pi:abort', sessionId),
    dispose: (sessionId: string) => ipcRenderer.invoke('pi:dispose', sessionId),
    onEvent: (sessionId: string, cb: (event: any) => void) => {
      const channel = `pi:event:${sessionId}`
      ipcRenderer.removeAllListeners(channel)
      ipcRenderer.on(channel, (_e, event) => cb(event))
    },
    removeListeners: (sessionId: string) => {
      ipcRenderer.removeAllListeners(`pi:event:${sessionId}`)
    },
    onAction: (cb: (action: any) => void) => {
      ipcRenderer.removeAllListeners('pi:action')
      ipcRenderer.on('pi:action', (_e, action) => cb(action))
    },
    offAction: () => ipcRenderer.removeAllListeners('pi:action'),
  },
  git: {
    log: (cwd: string, count?: number) => ipcRenderer.invoke('git:log', cwd, count),
    diffSummary: (cwd: string) => ipcRenderer.invoke('git:diffSummary', cwd),
    status: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
    branch: (cwd: string) => ipcRenderer.invoke('git:branch', cwd),
    stage: (cwd: string, path: string) => ipcRenderer.invoke('git:stage', cwd, path),
    unstage: (cwd: string, path: string) => ipcRenderer.invoke('git:unstage', cwd, path),
    stageAll: (cwd: string) => ipcRenderer.invoke('git:stageAll', cwd),
    commit: (cwd: string, message: string) => ipcRenderer.invoke('git:commit', cwd, message),
    aheadBehind: (cwd: string) => ipcRenderer.invoke('git:aheadBehind', cwd),
    push: (cwd: string) => ipcRenderer.invoke('git:push', cwd),
    pull: (cwd: string) => ipcRenderer.invoke('git:pull', cwd),
    discard: (cwd: string, path: string) => ipcRenderer.invoke('git:discard', cwd, path),
    remote: (cwd: string) => ipcRenderer.invoke('git:remote', cwd),
    gh: (cwd: string, args: string) => ipcRenderer.invoke('gh:run', cwd, args),
  },
})
