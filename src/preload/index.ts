import { contextBridge, ipcRenderer } from 'electron'
import type { VformApi } from '@shared/project'

const api: VformApi = {
  newProject: () => ipcRenderer.invoke('project:new'),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (files) => ipcRenderer.invoke('project:save', files)
}

contextBridge.exposeInMainWorld('vform', api)
