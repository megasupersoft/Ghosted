import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  fs: {
    readdir: (p: string) => ipcRenderer.invoke('fs:readdir', p),
    readfile: (p: string) => ipcRenderer.invoke('fs:readfile', p),
    writefile: (p: string, c: string) => ipcRenderer.invoke('fs:writefile', p, c),
    homedir: () => ipcRenderer.invoke('fs:homedir'),
  },
  pty: {
    create: (id: string, cwd: string, cols?: number, rows?: number) => ipcRenderer.invoke('pty:create', id, cwd, cols, rows),
    write: (id: string, data: string) => ipcRenderer.invoke('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('pty:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('pty:kill', id),
    onData: (id: string, cb: (d: string) => void) => ipcRenderer.on(`pty:data:${id}`, (_e, d) => cb(d)),
    onExit: (id: string, cb: () => void) => ipcRenderer.on(`pty:exit:${id}`, cb),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
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
