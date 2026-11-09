import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { VformApi } from '@shared/project'

/** Assina um canal do main e devolve a função que cancela a assinatura. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: VformApi = {
  newProject: () => ipcRenderer.invoke('project:new'),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (files) => ipcRenderer.invoke('project:save', files),
  run: {
    start: (payload) => ipcRenderer.invoke('run:start', payload),
    stop: () => ipcRenderer.invoke('run:stop'),
    onConsole: (cb) => subscribe('run:console', cb),
    onEnded: (cb) => subscribe('run:ended', cb),
    init: () => ipcRenderer.invoke('run:init'),
    ready: () => ipcRenderer.send('run:ready'),
    send: (msg) => ipcRenderer.send('run:send', msg),
    onMessage: (cb) => subscribe('run:message', cb)
  }
}

contextBridge.exposeInMainWorld('vform', api)
