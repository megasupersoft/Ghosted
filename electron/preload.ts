import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  fs: {
    readdir: (p: string) => ipcRenderer.invoke('fs:readdir', p),
    readfile: (p: string) => ipcRenderer.invoke('fs:readfile', p),
    writefile: (p: string, c: string) => ipcRenderer.invoke('fs:writefile', p, c),
    homedir: () => ipcRenderer.invoke('fs:homedir'),
  },
  pty: {
    create: (id: string, cwd: string) => ipcRenderer.invoke('pty:create', id, cwd),
    write: (id: string, data: string) => ipcRenderer.invoke('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('pty:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('pty:kill', id),
    onData: (id: string, cb: (d: string) => void) => ipcRenderer.on(`pty:data:${id}`, (_e, d) => cb(d)),
    onExit: (id: string, cb: () => void) => ipcRenderer.on(`pty:exit:${id}`, cb),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
})
