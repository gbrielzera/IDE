import { create } from 'zustand'
import type { FormDocument, LoadedProject } from '@shared/project'
import {
  addNode,
  createNode,
  deleteNodes,
  duplicateNodes,
  moveToIndex,
  renameNode,
  setFormProps,
  setProp,
  setRects
} from './core/commands'
import {
  createTracked,
  followRenames,
  mutate,
  redo as redoHistory,
  undo as undoHistory,
  type HistoryEntry,
  type Tracked
} from './core/history'
import { allIds, locate, topmost } from './core/tree'
import { idProblem } from './core/ids'
import { parseFormDocument, serializeForm } from './core/model'
import { layoutOf } from './core/props'

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
  edit(recipe: (draft: FormDocument) => void, txn?: string, renames?: HistoryEntry['renames']): void
  undo(): void
  redo(): void
  addComponent(type: string, parentId: string | null, x: number, y: number, index?: number): void
  /** Renomeia o componente; devolve a mensagem do problema (ID inválido ou em uso) ou null se deu certo. */
  renameComponent(id: string, newId: string): string | null
  setProp(id: string, key: string, value: unknown, txn?: string): void
  setFormProps(props: { title?: string; width?: number; height?: number }): void
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

    edit(recipe, txn, renames) {
      const { activeForm, tracked } = get()
      const t = activeForm ? tracked[activeForm] : undefined
      if (!activeForm || !t) return
      const next = mutate(t, recipe, txn, renames)
      if (next !== t) set({ tracked: { ...tracked, [activeForm]: next }, dirty: true })
    },

    undo() {
      const { activeForm, tracked, selection } = get()
      const t = activeForm ? tracked[activeForm] : undefined
      if (!activeForm || !t || t.undo.length === 0) return
      const entry = t.undo[t.undo.length - 1]
      const next = undoHistory(t)
      const ids = pruneSelection(next.doc, followRenames(selection, entry.renames, 'undo'))
      set({ tracked: { ...tracked, [activeForm]: next }, selection: ids, dirty: true })
    },

    redo() {
      const { activeForm, tracked, selection } = get()
      const t = activeForm ? tracked[activeForm] : undefined
      if (!activeForm || !t || t.redo.length === 0) return
      const entry = t.redo[t.redo.length - 1]
      const next = redoHistory(t)
      const ids = pruneSelection(next.doc, followRenames(selection, entry.renames, 'redo'))
      set({ tracked: { ...tracked, [activeForm]: next }, selection: ids, dirty: true })
    },

    addComponent(type, parentId, x, y, index) {
      const doc = get().currentDoc()
      if (!doc) return
      const node = createNode(doc, type, x, y)
      if (!node) return
      get().edit((d) => addNode(d, parentId, node, index))
      set({ selection: [node.id] })
    },

    renameComponent(id, newId) {
      const doc = get().currentDoc()
      if (!doc || id === newId) return null
      const problem = idProblem(newId)
      if (problem) return problem
      if (allIds(doc).has(newId)) return `Já existe um componente com o ID "${newId}".`
      get().edit((d) => renameNode(d, id, newId), undefined, [[id, newId]])
      set((s) => ({ selection: s.selection.map((s2) => (s2 === id ? newId : s2)) }))
      return null
    },

    setProp(id, key, value, txn) {
      get().edit((d) => setProp(d, id, key, value), txn)
    },

    setFormProps(props) {
      get().edit((d) => setFormProps(d, props))
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
      const reorders: [id: string, parentId: string, index: number][] = []
      for (const id of ids) {
        const loc = locate(doc, id)
        if (!loc) continue
        const layout = loc.parent ? layoutOf(loc.parent) : null
        if (loc.parent && layout && layout.mode !== 'absolute') {
          // Em auto-layout a seta troca o item de lugar na ordem, em vez de mover pixels.
          const dir = Math.sign(layout.mode === 'vertical' ? dy : dx)
          if (dir !== 0) reorders.push([id, loc.parent.id, loc.index + dir])
        } else {
          rects[id] = { x: Math.max(0, loc.node.x + dx), y: Math.max(0, loc.node.y + dy) }
        }
      }
      get().edit((d) => {
        setRects(d, rects)
        for (const [id, parentId, index] of reorders) moveToIndex(d, id, parentId, index)
      })
    }
  }
})

/** Documento do formulário ativo (ou null se ele não pôde ser lido). */
export function useActiveFormDoc(): FormDocument | null {
  return useIde((s) => (s.activeForm ? (s.tracked[s.activeForm]?.doc ?? null) : null))
}
