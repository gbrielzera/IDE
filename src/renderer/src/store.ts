import { create } from 'zustand'
import { PROJECT_FILE, type FormDocument, type LoadedProject } from '@shared/project'
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
import { buildRunComponents } from './core/runstate'
import { ensureHandler, eventForDoubleClick } from './core/script'
import type { RunConsoleMessage, RunEnded } from '@shared/run'

export type LogLevel = 'info' | 'warn' | 'error'

export interface ConsoleLine {
  id: number
  time: string
  level: LogLevel
  text: string
  /** Erros de execução do script: linha e arquivo, para pular até o código ao clicar. */
  line?: number
  file?: string
}

export type View = 'design' | 'code'

export interface RunError {
  line: number
  message: string
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
  /** Há uma janela de execução aberta (e qual: avisos de execuções antigas são ignorados). */
  running: boolean
  runId: number | null
  /** Texto do script de cada formulário (a fonte da verdade enquanto o projeto está aberto). */
  scripts: Record<string, string>
  /** Scripts alterados na IDE e ainda não salvos: só esses são gravados (os outros podem ter sido editados fora). */
  scriptDirty: Record<string, boolean>
  /**
   * Contador por formulário, incrementado quando o texto do script muda POR FORA do editor (handler criado
   * pelo duplo clique, projeto reaberto). O editor só copia o texto da store para o Monaco quando ele muda:
   * copiar a cada atualização devolveria à tela um eco atrasado do que foi digitado e apagaria teclas.
   */
  scriptSync: Record<string, number>
  /** O que a área central mostra: o formulário (design) ou o script (code). */
  activeView: View
  /** Pedido para o editor levar o cursor a uma linha (o `nonce` distingue pedidos repetidos). */
  reveal: { form: string; line: number; nonce: number } | null
  /** Erros da última execução, marcados na linha do script. */
  runErrors: Record<string, RunError[]>

  newProject(): Promise<void>
  openProject(): Promise<void>
  saveProject(): Promise<void>
  setActiveForm(name: string): void
  openTab(form: string, view: View): void
  log(level: LogLevel, text: string, meta?: { line?: number; file?: string }): void
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
  /** Executa o formulário ativo (layout atual + script do disco) numa janela própria. */
  run(): Promise<void>
  stop(): Promise<void>
  runEnded(ended: RunEnded): void
  /** Mensagem do console vinda do Python: vai para o console e, se for erro com linha, marca o script. */
  runConsole(msg: RunConsoleMessage): void
  /** `origin` 'editor' = digitado no Monaco (ele já tem o texto); 'external' = mudou por fora e o Monaco deve copiar. */
  setScript(form: string, text: string, origin?: 'editor' | 'external'): void
  /** Duplo clique: cria (ou localiza) o handler do evento padrão do componente e abre o código nele. */
  openHandler(componentId: string | null): void
  /** Abre o script que tem esse nome de arquivo na linha dada (clique no erro do console). */
  goToScript(file: string, line: number): void
  clearReveal(): void
  deleteSelection(): void
  duplicateSelection(): void
  nudgeSelection(dx: number, dy: number): void
}

let nextLineId = 1
let nextRevealNonce = 1

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path

/** A última linha não vazia (a mensagem da exceção, em um traceback). */
function lastLine(text: string): string {
  return (
    text
      .split('\n')
      .filter((l) => l.trim() !== '')
      .pop()
      ?.trim() ?? text
  )
}

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
        const scripts: Record<string, string> = {}
        for (const form of project.manifest.forms) scripts[form.name] = project.files[form.script] ?? ''
        set({
          project,
          tracked,
          scripts,
          scriptDirty: {},
          scriptSync: Object.fromEntries(
            project.manifest.forms.map((f) => [f.name, (get().scriptSync[f.name] ?? 0) + 1])
          ),
          runErrors: {},
          reveal: null,
          activeView: 'design',
          selection: [],
          activeForm: project.manifest.forms[0]?.name ?? null,
          dirty: false
        })
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
    running: false,
    runId: null,
    scripts: {},
    scriptDirty: {},
    scriptSync: {},
    activeView: 'design',
    reveal: null,
    runErrors: {},

    newProject: () => load('new'),
    openProject: () => load('open'),

    async saveProject() {
      const { project, tracked, scripts, scriptDirty, busy } = get()
      if (!project || busy) return
      set({ busy: true })
      try {
        // Grava os layouts e só os scripts alterados aqui: um script que ninguém mexeu na IDE pode ter
        // sido editado em outro programa, e regravar a cópia antiga o desfaria.
        const files: Record<string, string> = { [PROJECT_FILE]: project.files[PROJECT_FILE] }
        for (const form of project.manifest.forms) {
          const t = tracked[form.name]
          if (t) files[form.layout] = serializeForm(t.doc)
          if (scriptDirty[form.name]) files[form.script] = scripts[form.name] ?? ''
        }
        const res = await window.vform.saveProject(files)
        if (res.ok) {
          set({ project: { ...project, files: { ...project.files, ...files } }, scriptDirty: {}, dirty: false })
          get().log('info', 'Projeto salvo.')
        } else {
          get().log('error', `Falha ao salvar: ${res.error}`)
        }
      } finally {
        set({ busy: false })
      }
    },

    setActiveForm: (name) => set({ activeForm: name, selection: [] }),

    openTab: (form, view) =>
      set((s) => ({ activeForm: form, activeView: view, selection: form === s.activeForm ? s.selection : [] })),

    log: (level, text, meta) =>
      set((s) => ({
        console: [
          ...s.console.slice(-499),
          { id: nextLineId++, time: now(), level, text, line: meta?.line, file: meta?.file }
        ]
      })),

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

    async run() {
      const { project, activeForm, tracked, busy } = get()
      if (!project || !activeForm || busy) return
      const form = project.manifest.forms.find((f) => f.name === activeForm)
      const t = tracked[activeForm]
      if (!form || !t) {
        get().log('error', 'O formulário ativo não pôde ser lido; corrija o arquivo para executar.')
        return
      }
      set({ runErrors: {} })
      const res = await window.vform.run.start({
        formName: form.name,
        scriptPath: form.script,
        // Texto alterado no editor e ainda não salvo vale; senão o main lê o arquivo do disco (edição externa).
        script: get().scriptDirty[form.name] ? get().scripts[form.name] : undefined,
        doc: t.doc,
        components: buildRunComponents(t.doc)
      })
      if (res.ok) set({ running: true, runId: res.runId })
      else get().log('error', res.error)
    },

    async stop() {
      if (get().running) await window.vform.run.stop()
    },

    runEnded(ended) {
      if (ended.runId !== get().runId) return // aviso de uma execução antiga (já substituída)
      set({ running: false, runId: null })
      if (ended.reason !== 'crashed') get().log('info', 'Execução encerrada.')
    },

    runConsole(msg) {
      get().log(msg.level, msg.text, { line: msg.line, file: msg.file })
      const { project } = get()
      if (msg.level !== 'error' || msg.line === undefined || !msg.file || !project) return
      const form = project.manifest.forms.find((f) => baseName(f.script) === msg.file)?.name
      if (!form) return
      const entry = { line: msg.line, message: lastLine(msg.text) }
      set((s) => ({ runErrors: { ...s.runErrors, [form]: [...(s.runErrors[form] ?? []), entry] } }))
    },

    setScript(form, text, origin = 'editor') {
      if (get().scripts[form] === text) return
      set((s) => ({
        scripts: { ...s.scripts, [form]: text },
        scriptDirty: { ...s.scriptDirty, [form]: true },
        scriptSync: origin === 'external' ? { ...s.scriptSync, [form]: (s.scriptSync[form] ?? 0) + 1 } : s.scriptSync,
        dirty: true
      }))
    },

    openHandler(componentId) {
      const { activeForm, scripts } = get()
      const doc = get().currentDoc()
      if (!activeForm || !doc) return
      let event = 'click'
      if (componentId !== null) {
        const node = locate(doc, componentId)?.node
        if (!node) return
        event = eventForDoubleClick(node.type)
      }
      const res = ensureHandler(scripts[activeForm] ?? '', componentId, event)
      if (res.created) get().setScript(activeForm, res.script, 'external')
      set({ activeView: 'code', reveal: { form: activeForm, line: res.line, nonce: nextRevealNonce++ } })
    },

    goToScript(file, line) {
      const { project, activeForm } = get()
      const form = project?.manifest.forms.find((f) => baseName(f.script) === file)?.name
      if (!form) return
      set({
        activeForm: form,
        activeView: 'code',
        selection: form === activeForm ? get().selection : [],
        reveal: { form, line, nonce: nextRevealNonce++ }
      })
    },

    clearReveal: () => set({ reveal: null }),

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

