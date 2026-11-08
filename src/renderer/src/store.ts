import { create } from 'zustand'
import type { FormDocument, LoadedProject } from '@shared/project'
import { addNode, createNode, deleteNodes, duplicateNodes, setRects } from './core/commands'
import { createTracked, mutate, redo as redoHistory, undo as undoHistory, type Tracked } from './core/history'
import { parseFormDocument, serializeForm } from './core/model'
import { locate, topmost } from './core/tree'

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
  /** Documento + histórico de cada formulário que carregou sem erro. */
  tracked: Record<string, Tracked>
  /** IDs dos componentes selecionados no formulário ativo. */
  selection: string[]

  newProject(): Promise<void>
  openProject(): Promise<void>
  saveProject(): Promise<void>
  setActiveForm(name: string): void
  log(level: LogLevel, text: string): void
  clearConsole(): void

  currentDoc(): FormDocument | null
  select(ids: string[]): void
  /** Aplica uma edição; edições seguidas com o mesmo `txn` viram uma só entrada no histórico. */
  edit(recipe: (draft: FormDocument) => void, txn?: string): void
  undo(): void
  redo(): void
  addComponent(type: string, parentId: string | null, x: number, y: number): void
  deleteSelection(): void
  duplicateSelection(): void
  nudgeSelection(dx: number, dy: number): void
}

let nextLineId = 1

function now(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false })
}

function pruneSelection(doc: FormDocument, ids: string[]): string[] {
  return ids.filter((id) => locate(doc, id) !== null)
}

export const useIde = create<IdeState>((set, get) => {
  async function load(kind: 'new' | 'open'): Promise<void> {
    if (get().busy) return
    set({ busy: true })
    try {
      const res = kind === 'new' ? await window.vform.newProject() : await window.vform.openProject()
      if (res.ok) {
        const { project } = res
        const tracked: Record<string, Tracked> = {}
        const problems: string[] = []
        for (const form of project.manifest.forms) {
          try {
            tracked[form.name] = createTracked(parseFormDocument(project.files[form.layout]))
          } catch (err) {
            problems.push(`Formulário ${form.name}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
        set({ project, tracked, selection: [], activeForm: project.manifest.forms[0]?.name ?? null, dirty: false })
        document.title = `${project.manifest.name} — VForm IDE`
        get().log('info', `Projeto "${project.manifest.name}" ${kind === 'new' ? 'criado' : 'aberto'} em ${project.dir}`)
        problems.forEach((p) => get().log('error', p))
      } else if (!res.canceled) {
        get().log('error', res.error)
      }
    } finally {
      set({ busy: false })
    }
  }

  function selectionRoots(): string[] {
    const doc = get().currentDoc()
    return doc ? topmost(doc, get().selection) : []
  }

  return {
    project: null,
    activeForm: null,
    dirty: false,
    busy: false,
    console: [],
    tracked: {},
    selection: [],

    newProject: () => load('new'),
    openProject: () => load('open'),

    async saveProject() {
      const { project, tracked, busy } = get()
      if (!project || busy) return
      set({ busy: true })
      try {
        const files = { ...project.files }
        for (const form of project.manifest.forms) {
          const t = tracked[form.name]
          if (t) files[form.layout] = serializeForm(t.doc)
        }
        const res = await window.vform.saveProject(files)
        if (res.ok) {
          set({ project: { ...project, files }, dirty: false })
          get().log('info', 'Projeto salvo.')
        } else {
          get().log('error', `Falha ao salvar: ${res.error}`)
        }
      } finally {
        set({ busy: false })
      }
    },

    setActiveForm: (name) => set({ activeForm: name, selection: [] }),

    log: (level, text) =>
      set((s) => ({ console: [...s.console.slice(-499), { id: nextLineId++, time: now(), level, text }] })),

    clearConsole: () => set({ console: [] }),

    currentDoc() {
      const { activeForm, tracked } = get()
      return activeForm ? (tracked[activeForm]?.doc ?? null) : null
    },

    select: (ids) => set({ selection: ids }),

    edit(recipe, txn) {
      const { activeForm, tracked } = get()
      const t = activeForm ? tracked[activeForm] : undefined
      if (!activeForm || !t) return
      const next = mutate(t, recipe, txn)
      if (next !== t) set({ tracked: { ...tracked, [activeForm]: next }, dirty: true })
    },

    undo() {
      const { activeForm, tracked, selection } = get()
      const t = activeForm ? tracked[activeForm] : undefined
      if (!activeForm || !t || t.undo.length === 0) return
      const next = undoHistory(t)
      set({ tracked: { ...tracked, [activeForm]: next }, selection: pruneSelection(next.doc, selection), dirty: true })
    },

    redo() {
      const { activeForm, tracked, selection } = get()
      const t = activeForm ? tracked[activeForm] : undefined
      if (!activeForm || !t || t.redo.length === 0) return
      const next = redoHistory(t)
      set({ tracked: { ...tracked, [activeForm]: next }, selection: pruneSelection(next.doc, selection), dirty: true })
    },

    addComponent(type, parentId, x, y) {
      const doc = get().currentDoc()
      if (!doc) return
      const node = createNode(doc, type, x, y)
      if (!node) return
      get().edit((d) => addNode(d, parentId, node))
      set({ selection: [node.id] })
    },

    deleteSelection() {
      const ids = selectionRoots()
      if (ids.length === 0) return
      get().edit((d) => deleteNodes(d, ids))
      set({ selection: [] })
    },

    duplicateSelection() {
      const ids = selectionRoots()
      if (ids.length === 0) return
      let created: string[] = []
      get().edit((d) => {
        created = duplicateNodes(d, ids)
      })
      if (created.length > 0) set({ selection: created })
    },

    nudgeSelection(dx, dy) {
      const doc = get().currentDoc()
      const ids = selectionRoots()
      if (!doc || ids.length === 0) return
      const rects: Record<string, { x: number; y: number }> = {}
      for (const id of ids) {
        const node = locate(doc, id)?.node
        if (node) rects[id] = { x: Math.max(0, node.x + dx), y: Math.max(0, node.y + dy) }
      }
      get().edit((d) => setRects(d, rects))
    }
  }
})

/** Documento do formulário ativo (ou null se ele não pôde ser lido). */
export function useActiveFormDoc(): FormDocument | null {
  return useIde((s) => (s.activeForm ? (s.tracked[s.activeForm]?.doc ?? null) : null))
}
