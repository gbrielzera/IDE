import { useMemo } from 'react'
import { create } from 'zustand'
import type { FormDocument, LoadedProject } from '@shared/project'

export type LogLevel = 'info' | 'warn' | 'error'

export interface ConsoleLine {
  id: number
  time: string
  level: LogLevel
  text: string
}

interface IdeState {
  project: LoadedProject | null
  activeForm: string | null
  dirty: boolean
  busy: boolean
  console: ConsoleLine[]

  newProject(): Promise<void>
  openProject(): Promise<void>
  saveProject(): Promise<void>
  setActiveForm(name: string): void
  log(level: LogLevel, text: string): void
  clearConsole(): void
}

let nextLineId = 1

function now(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false })
}

export const useIde = create<IdeState>((set, get) => {
  async function load(kind: 'new' | 'open'): Promise<void> {
    if (get().busy) return
    set({ busy: true })
    try {
      const res = kind === 'new' ? await window.vform.newProject() : await window.vform.openProject()
      if (res.ok) {
        const { project } = res
        set({ project, activeForm: project.manifest.forms[0]?.name ?? null, dirty: false })
        document.title = `${project.manifest.name} — VForm IDE`
        get().log('info', `Projeto "${project.manifest.name}" ${kind === 'new' ? 'criado' : 'aberto'} em ${project.dir}`)
      } else if (!res.canceled) {
        get().log('error', res.error)
      }
    } finally {
      set({ busy: false })
    }
  }

  return {
    project: null,
    activeForm: null,
    dirty: false,
    busy: false,
    console: [],

    newProject: () => load('new'),
    openProject: () => load('open'),

    async saveProject() {
      const { project, busy } = get()
      if (!project || busy) return
      set({ busy: true })
      try {
        const res = await window.vform.saveProject(project.files)
        if (res.ok) {
          set({ dirty: false })
          get().log('info', 'Projeto salvo.')
        } else {
          get().log('error', `Falha ao salvar: ${res.error}`)
        }
      } finally {
        set({ busy: false })
      }
    },

    setActiveForm: (name) => set({ activeForm: name }),

    log: (level, text) =>
      set((s) => ({ console: [...s.console.slice(-499), { id: nextLineId++, time: now(), level, text }] })),

    clearConsole: () => set({ console: [] })
  }
})

/** Documento do formulário ativo (ou null se o JSON estiver ilegível). */
export function useActiveFormDoc(): FormDocument | null {
  const raw = useIde((s) => {
    const ref = s.project?.manifest.forms.find((f) => f.name === s.activeForm)
    return ref ? s.project?.files[ref.layout] : undefined
  })
  return useMemo(() => {
    if (!raw) return null
    try {
      return JSON.parse(raw) as FormDocument
    } catch {
      return null
    }
  }, [raw])
}
