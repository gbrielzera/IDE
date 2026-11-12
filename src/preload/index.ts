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
  saveProject: (files, discard) => ipcRenderer.invoke('project:save', files, discard),
  trustProject: () => ipcRenderer.invoke('project:trust'),
  help: { openManual: () => ipcRenderer.invoke('help:manual') },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch)
  },
  run: {
    start: (payload) => ipcRenderer.invoke('run:start', payload),
    stop: () => ipcRenderer.invoke('run:stop'),
    onConsole: (cb) => subscribe('run:console', cb),
    onEnded: (cb) => subscribe('run:ended', cb),
    init: () => ipcRenderer.invoke('run:init'),
    ready: () => ipcRenderer.send('run:ready'),
    send: (msg) => ipcRenderer.send('run:send', msg),
    openUrl: (url) => ipcRenderer.send('run:open-url', url),
    onMessage: (cb) => subscribe('run:message', cb),
    onReload: (cb) => subscribe('run:reload', cb)
  }
}

contextBridge.exposeInMainWorld('vform', api)
