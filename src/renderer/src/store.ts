import { create } from 'zustand'
import { newFormDocument, newFormScript, PROJECT_FILE, type FormDocument, type LoadedProject } from '@shared/project'
import { alignNodes, canAlign, canDistribute, distributeNodes, type AlignMode, type Axis } from './core/align'
import { clampRect, contentSize } from './core/bounds'
import { CATALOG, CATALOG_BY_TYPE } from './components/catalog'
import {
  addNode,
  createNode,
  deleteNodes,
  duplicateNodes,
  moveToIndex,
  pasteNodes,
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
import { formNameProblem, idProblem } from './core/ids'
import { parseFormDocument, serializeForm } from './core/model'
import { formatIssue } from '@shared/manifest'
import { validateForm } from './core/validate'
import { isAutoLayout, layoutOf } from './core/props'
import type { FormNode } from '@shared/project'
import { buildRunComponents } from './core/runstate'
import { renameInScript } from './core/refactor'
import { ensureHandler, eventForDoubleClick } from './core/script'
import type { Topic } from './core/glossary'
import { textKeyOf } from './core/textEdit'
import { typeOfId } from './core/pyapi'
import { NO_PREVIEW_WINDOW, type RunConsoleMessage, type RunEnded } from '@shared/run'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'

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

/** Registro permanente (aba Logs): guarda data completa e a execução de origem; "limpar" do console não o apaga. */
export interface LogEntry {
  id: number
  /** ISO 8601, para mostrar data e hora. */
  at: string
  level: LogLevel
  text: string
  /** Número da execução (1, 2, ...) em que ocorreu, ou null se foi fora de uma execução. */
  run: number | null
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
  logs: LogEntry[]
  /** Execução em andamento (para etiquetar os logs), ou null. */
  logRun: number | null
  runCounter: number
  /** Documento + histórico de cada formulário que carregou sem erro. */
  tracked: Record<string, Tracked>
  /** IDs dos componentes selecionados no formulário ativo. */
  selection: string[]
  /** Há uma janela de execução aberta (e qual: avisos de execuções antigas são ignorados). */
  running: boolean
  runId: number | null
  /** Formulário da execução em andamento (a pré-visualização ao vivo o acompanha, mesmo se você abrir outro). */
  runForm: string | null
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
  /**
   * Posição da janela do formulário na área de trabalho (px, a partir do canto superior esquerdo da área).
   * Sem entrada, o formulário fica centralizado. É só de visualização: não vai para o arquivo do projeto.
   */
  formPos: Record<string, { x: number; y: number }>
  setFormPos(form: string, pos: { x: number; y: number } | null): void
  /** Componentes copiados (área de transferência interna da IDE; vale entre formulários). */
  clipboard: FormNode[] | null
  /** Quantas vezes o mesmo conteúdo foi colado em sequência (cada colagem se desloca um pouco mais). */
  pasteCount: number
  /** Preferências do app (persistem entre execuções). */
  settings: Settings
  loadSettings(): Promise<void>
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>
  /** O que a área central mostra: o formulário (design) ou o script (code). */
  activeView: View
  /** Pedido para o editor levar o cursor a uma linha (o `nonce` distingue pedidos repetidos). */
  reveal: { form: string; line: number; nonce: number } | null
  /** Erros da última execução, marcados na linha do script. */
  runErrors: Record<string, RunError[]>

  newProject(): Promise<void>
  openProject(): Promise<void>
  /** `silent`: salvamento automático (não polui o console a cada alteração). */
  saveProject(opts?: { silent?: boolean }): Promise<void>
  setActiveForm(name: string): void
  /** Telas (formulários) do projeto: criar, remover e as janelas de confirmação. */
  formDialog: { kind: 'new' } | { kind: 'remove'; name: string } | { kind: 'trust' } | null
  openFormDialog(dialog: { kind: 'new' } | { kind: 'remove'; name: string } | { kind: 'trust' }): void
  /** Confirma a confiança no projeto aberto e executa em seguida. */
  trustAndRun(): Promise<void>
  closeFormDialog(): void
  /** Cria uma tela vazia e a abre; devolve a mensagem do problema (nome inválido/repetido) ou null. */
  addForm(name: string): string | null
  removeForm(name: string): void
  /** Arquivos de telas removidas que serão renomeados ao salvar. */
  removedFiles: string[]
  openTab(form: string, view: View): void
  log(level: LogLevel, text: string, meta?: { line?: number; file?: string }): void
  clearConsole(): void
  clearLogs(): void
  /** Dicionário aberto (página atual) ou null. Sem argumento, abre no componente selecionado ou no primeiro. */
  dictionary: Topic | null
  openDictionary(topic?: Topic): void
  closeDictionary(): void
  /** Abre o manual (.chm); avisa no console se não der. */
  openManual(): Promise<void>
  /** Componente cujo texto está sendo editado no canvas (F2 / menu do botão direito), ou null. */
  editingText: string | null
  startTextEdit(id?: string): void
  stopTextEdit(): void
  /** Menu do botão direito aberto (posição na tela e componente sob o cursor, se houver). */
  contextMenu: { x: number; y: number; id: string | null } | null
  openContextMenu(x: number, y: number, id: string | null): void
  closeContextMenu(): void

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
  /** `refresh`: pré-visualização ao vivo (atualiza a janela aberta, sem abrir outra). */
  run(opts?: { refresh?: boolean }): Promise<void>
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
  copySelection(): void
  cutSelection(): void
  pasteClipboard(): void
  /** Altera posição/tamanho de um componente respeitando a área do pai (ele nunca sai do formulário). */
  setNodeRect(id: string, rect: Partial<{ x: number; y: number; width: number; height: number }>): void
  alignSelection(mode: AlignMode): void
  distributeSelection(axis: Axis): void
  nudgeSelection(dx: number, dy: number): void
}

let nextLineId = 1

/** Deslocamento (px) de cada colagem sucessiva do mesmo conteúdo. */
const DUPLICATE_STEP = 16
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
          formPos: {},
          removedFiles: [],
          formDialog: null,
          reveal: null,
          activeView: 'design',
          selection: [],
          activeForm: project.manifest.forms[0]?.name ?? null,
          dirty: false
        })
        document.title = `${project.manifest.name} — VForm IDE`
        get().log('info', `Projeto "${project.manifest.name}" ${kind === 'new' ? 'criado' : 'aberto'} em ${project.dir}`)
        problems.forEach((p) => get().log('error', p))
        for (const form of project.manifest.forms) {
          const t = tracked[form.name]
          if (t) for (const issue of validateForm(t.doc, form.layout)) get().log(issue.severity === 'error' ? 'error' : 'warn', formatIssue(issue))
        }
      } else if (!res.canceled) {
        get().log('error', res.error)
      }
    } finally {
      set({ busy: false })
    }
  }

  /**
   * Aplica ao script do formulário ativo os renomeios de IDs (ao renomear, desfazer ou refazer), para o código
   * e o layout nunca divergirem. Devolve quantas referências foram atualizadas.
   */
  function applyRenamesToScript(renames: HistoryEntry['renames'], direction: 'undo' | 'redo'): number {
    const form = get().activeForm
    if (!form || !renames?.length) return 0
    const steps = direction === 'undo' ? [...renames].reverse().map(([from, to]) => [to, from] as const) : renames
    let script = get().scripts[form] ?? ''
    let total = 0
    for (const [from, to] of steps) {
      const r = renameInScript(script, from, to)
      script = r.script
      total += r.count
    }
    if (total > 0) get().setScript(form, script, 'external')
    return total
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
    logs: [],
    logRun: null,
    runCounter: 0,
    tracked: {},
    selection: [],
    running: false,
    runId: null,
    runForm: null,
    scripts: {},
    scriptDirty: {},
    scriptSync: {},
    formPos: {},
    clipboard: null,
    pasteCount: 0,
    settings: DEFAULT_SETTINGS,
    activeView: 'design',
    reveal: null,
    runErrors: {},

    newProject: () => load('new'),
    openProject: () => load('open'),

    async loadSettings() {
      set({ settings: await window.vform.settings.get() })
    },

    async setSetting(key, value) {
      set((s) => ({ settings: { ...s.settings, [key]: value } })) // vale já; a gravação em disco vem depois
      set({ settings: await window.vform.settings.set({ [key]: value }) })
      // Ligar o "ao vivo" abre a prévia ao lado da IDE na hora (como o Live Preview do VS Code).
      if (key === 'livePreview' && value === true && !get().running && get().project && get().activeForm) void get().run()
    },

    async saveProject(opts) {
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
        const res = await window.vform.saveProject(files, get().removedFiles)
        if (res.ok) {
          set({ project: { ...get().project!, files: { ...get().project!.files, ...files } }, scriptDirty: {}, removedFiles: [], dirty: false })
          if (!opts?.silent) get().log('info', 'Projeto salvo.')
        } else {
          get().log('error', `Falha ao salvar: ${res.error}`)
        }
      } finally {
        set({ busy: false })
      }
    },

    setActiveForm: (name) => set({ activeForm: name, selection: [] }),

    formDialog: null,
    removedFiles: [],
    openFormDialog: (formDialog) => set({ formDialog }),
    closeFormDialog: () => set({ formDialog: null }),
    async trustAndRun() {
      const { project } = get()
      if (!project) return
      await window.vform.trustProject()
      set({ project: { ...project, trusted: true }, formDialog: null })
      await get().run()
    },

    addForm(rawName) {
      const { project } = get()
      if (!project) return 'Nenhum projeto aberto.'
      const name = rawName.trim()
      const problem = formNameProblem(name, project.manifest.forms.map((f) => f.name))
      if (problem) return problem
      const ref = { name, layout: `${name}.form.json`, script: `${name}.py` }
      const manifest = { ...project.manifest, forms: [...project.manifest.forms, ref] }
      const doc = newFormDocument(name)
      const script = newFormScript(name)
      set((s) => ({
        project: {
          ...project,
          manifest,
          files: {
            ...project.files,
            [PROJECT_FILE]: JSON.stringify(manifest, null, 2) + '\n',
            [ref.layout]: serializeForm(doc),
            [ref.script]: script
          }
        },
        tracked: { ...s.tracked, [name]: createTracked(doc) },
        scripts: { ...s.scripts, [name]: script },
        scriptDirty: { ...s.scriptDirty, [name]: true }, // o script novo precisa ser gravado
        scriptSync: { ...s.scriptSync, [name]: (s.scriptSync[name] ?? 0) + 1 },
        removedFiles: s.removedFiles.filter((f) => f !== ref.layout && f !== ref.script),
        activeForm: name,
        activeView: 'design',
        selection: [],
        formDialog: null,
        dirty: true
      }))
      get().log('info', `Tela "${name}" criada (${ref.layout} e ${ref.script}).`)
      return null
    },

    removeForm(name) {
      const { project, activeForm } = get()
      if (!project || project.manifest.forms.length <= 1) return
      const ref = project.manifest.forms.find((f) => f.name === name)
      if (!ref) return
      const forms = project.manifest.forms.filter((f) => f.name !== name)
      const manifest = { ...project.manifest, forms }
      const without = <T,>(m: Record<string, T>): Record<string, T> => {
        const next = { ...m }
        delete next[name]
        return next
      }
      const files: Record<string, string> = { ...project.files, [PROJECT_FILE]: JSON.stringify(manifest, null, 2) + '\n' }
      delete files[ref.layout]
      delete files[ref.script]
      set((s) => ({
        project: { ...project, manifest, files },
        tracked: without(s.tracked),
        scripts: without(s.scripts),
        scriptDirty: without(s.scriptDirty),
        formPos: without(s.formPos),
        removedFiles: [...s.removedFiles, ref.layout, ref.script],
        activeForm: activeForm === name ? forms[0].name : activeForm,
        activeView: activeForm === name ? 'design' : s.activeView,
        selection: activeForm === name ? [] : s.selection,
        formDialog: null,
        dirty: true
      }))
      get().log('info', `Tela "${name}" removida do projeto. Os arquivos ficam na pasta como ${ref.layout}.removido e ${ref.script}.removido (ao salvar).`)
    },

    setFormPos: (form, pos) =>
      set((s) => {
        const next = { ...s.formPos }
        if (pos) next[form] = pos
        else delete next[form]
        return { formPos: next }
      }),

    openTab: (form, view) =>
      set((s) => ({ activeForm: form, activeView: view, selection: form === s.activeForm ? s.selection : [] })),

    log: (level, text, meta) =>
      set((s) => {
        const id = nextLineId++
        return {
          console: [...s.console.slice(-499), { id, time: now(), level, text, line: meta?.line, file: meta?.file }],
          logs: [
            ...s.logs.slice(-1999),
            { id, at: new Date().toISOString(), level, text, run: s.logRun, line: meta?.line, file: meta?.file }
          ]
        }
      }),

    clearConsole: () => set({ console: [] }),
    clearLogs: () => set({ logs: [] }),

    dictionary: null,
    openDictionary(topic) {
      if (topic) return set({ dictionary: topic })
      const { selection } = get()
      const doc = get().currentDoc()
      const first = doc && selection.length === 1 ? typeOfId(doc, selection[0]) : null
      set({ dictionary: { kind: 'component', type: first ?? CATALOG[0].type } })
    },
    closeDictionary: () => set({ dictionary: null }),
    async openManual() {
      const res = await window.vform.help.openManual()
      if (res.ok) get().log('info', `Manual aberto (${res.path}).`)
      else get().log('error', `Não foi possível abrir o manual: ${res.error}`)
    },

    editingText: null,
    startTextEdit(id) {
      const doc = get().currentDoc()
      const target = id ?? (get().selection.length === 1 ? get().selection[0] : null)
      const node = doc && target ? locate(doc, target)?.node : null
      if (!node || !textKeyOf(node.type)) return
      set({ editingText: node.id, selection: [node.id], contextMenu: null })
    },
    stopTextEdit: () => set({ editingText: null }),

    contextMenu: null,
    openContextMenu(x, y, id) {
      if (id && !get().selection.includes(id)) set({ selection: [id] })
      set({ contextMenu: { x, y, id }, editingText: null })
    },
    closeContextMenu: () => set({ contextMenu: null }),

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
      applyRenamesToScript(entry.renames, 'undo')
    },

    redo() {
      const { activeForm, tracked, selection } = get()
      const t = activeForm ? tracked[activeForm] : undefined
      if (!activeForm || !t || t.redo.length === 0) return
      const entry = t.redo[t.redo.length - 1]
      const next = redoHistory(t)
      const ids = pruneSelection(next.doc, followRenames(selection, entry.renames, 'redo'))
      set({ tracked: { ...tracked, [activeForm]: next }, selection: ids, dirty: true })
      applyRenamesToScript(entry.renames, 'redo')
    },

    addComponent(type, parentId, x, y, index) {
      const doc = get().currentDoc()
      if (!doc) return
      const node = createNode(doc, type, x, y)
      if (!node) return
      // Fica dentro da área do pai (em auto-layout o pai posiciona; x/y não valem).
      const host = parentId ? locate(doc, parentId)?.node : undefined
      const parent = host && CATALOG_BY_TYPE[host.type]?.container ? host : null
      if (!parent || !isAutoLayout(parent)) {
        const at = clampRect(node, contentSize(doc, parent?.id ?? null))
        node.x = at.x
        node.y = at.y
      }
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
      // O código Python que usa o ID antigo acompanha a mudança.
      const updated = applyRenamesToScript([[id, newId]], 'redo')
      if (updated > 0) {
        const file = get().project?.manifest.forms.find((f) => f.name === get().activeForm)?.script
        get().log('info', `ID renomeado: "${id}" → "${newId}" (${updated} referência${updated === 1 ? '' : 's'} atualizada${updated === 1 ? '' : 's'} em ${file ?? 'o script'}).`)
      }
      return null
    },

    setProp(id, key, value, txn) {
      get().edit((d) => setProp(d, id, key, value), txn)
    },

    setFormProps(props) {
      get().edit((d) => setFormProps(d, props))
    },

    async run(opts) {
      const { project, tracked, busy } = get()
      const refresh = opts?.refresh === true
      // Ao vivo, atualiza o formulário que já está em execução, não o que está na tela agora.
      const target = refresh ? get().runForm : get().activeForm
      if (!project || !target || busy) return
      if (project.trusted === false) {
        if (!refresh) set({ formDialog: { kind: 'trust' } }) // pergunta uma vez por projeto
        return
      }
      const form = project.manifest.forms.find((f) => f.name === target)
      const t = tracked[target]
      const blocking = t && form ? validateForm(t.doc, form.layout).filter((i) => i.severity === 'error') : []
      if (blocking.length > 0) {
        get().log('error', `Não é possível executar: o formulário tem ${blocking.length} problema(s) a corrigir.`)
        blocking.forEach((i) => get().log('error', formatIssue(i)))
        return
      }
      if (!form || !t) {
        get().log('error', 'O formulário ativo não pôde ser lido; corrija o arquivo para executar.')
        return
      }
      const logRun = refresh && get().logRun !== null ? get().logRun : get().runCounter + 1
      set({ runErrors: {}, logRun, runCounter: Math.max(get().runCounter, logRun!) })
      if (!refresh) get().log('info', `Execução ${logRun} iniciada (${form.name}).`)
      const res = await window.vform.run.start({
        reuse: refresh,
        // Com a pré-visualização ao vivo ligada, a janela nova abre ao lado da IDE.
        dock: !refresh && get().settings.livePreview,
        formName: form.name,
        scriptPath: form.script,
        // Texto alterado no editor e ainda não salvo vale; senão o main lê o arquivo do disco (edição externa).
        script: get().scriptDirty[form.name] ? get().scripts[form.name] : undefined,
        doc: t.doc,
        components: buildRunComponents(t.doc),
        screens: project.manifest.forms.flatMap((f) => {
          const ft = tracked[f.name]
          if (!ft) return []
          return [
            {
              formName: f.name,
              scriptPath: f.script,
              script: get().scriptDirty[f.name] ? get().scripts[f.name] : undefined,
              doc: ft.doc,
              components: buildRunComponents(ft.doc)
            }
          ]
        })
      })
      if (res.ok) set({ running: true, runId: res.runId, runForm: form.name })
      else {
        if (!(refresh && res.error === NO_PREVIEW_WINDOW)) get().log('error', res.error)
        if (!get().running) set({ logRun: null })
      }
    },

    async stop() {
      if (get().running) await window.vform.run.stop()
    },

    runEnded(ended) {
      if (ended.runId !== get().runId) return // aviso de uma execução antiga (já substituída)
      set({ running: false, runId: null, runForm: null })
      if (ended.reason !== 'crashed') get().log('info', 'Execução encerrada.')
      set({ logRun: null })
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

    copySelection() {
      const doc = get().currentDoc()
      if (!doc) return
      const nodes = selectionRoots()
        .map((id) => locate(doc, id)?.node)
        .filter((n): n is FormNode => n !== undefined)
        .map((n) => JSON.parse(JSON.stringify(n)) as FormNode)
      if (nodes.length > 0) set({ clipboard: nodes, pasteCount: 0 })
    },

    cutSelection() {
      get().copySelection()
      get().deleteSelection()
    },

    pasteClipboard() {
      const { clipboard, pasteCount, selection } = get()
      const doc = get().currentDoc()
      if (!doc || !clipboard || clipboard.length === 0) return
      // Dentro do container selecionado; senão, ao lado do componente selecionado (mesmo pai).
      let parentId: string | null = null
      if (selection.length > 0) {
        const first = locate(doc, selection[0])
        if (first) parentId = selection.length === 1 && CATALOG_BY_TYPE[first.node.type]?.container ? first.node.id : (first.parent?.id ?? null)
      }
      let created: string[] = []
      get().edit((d) => {
        created = pasteNodes(d, parentId, clipboard, DUPLICATE_STEP * (pasteCount + 1))
      })
      if (created.length > 0) set({ selection: created, pasteCount: pasteCount + 1 })
    },

    setNodeRect(id, rect) {
      const doc = get().currentDoc()
      const loc = doc ? locate(doc, id) : null
      if (!doc || !loc) return
      const wanted = { ...loc.node, ...rect }
      const fixed = loc.parent && isAutoLayout(loc.parent) ? wanted : clampRect(wanted, contentSize(doc, loc.parent?.id ?? null))
      get().edit((d) => setRects(d, { [id]: { x: fixed.x, y: fixed.y, width: fixed.width, height: fixed.height } }))
    },

    alignSelection(mode) {
      const doc = get().currentDoc()
      const ids = selectionRoots()
      if (!doc || !canAlign(doc, ids)) return
      get().edit((d) => alignNodes(d, ids, mode))
    },

    distributeSelection(axis) {
      const doc = get().currentDoc()
      const ids = selectionRoots()
      if (!doc || !canDistribute(doc, ids)) return
      get().edit((d) => distributeNodes(d, ids, axis))
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
          const at = clampRect({ ...loc.node, x: loc.node.x + dx, y: loc.node.y + dy }, contentSize(doc, loc.parent?.id ?? null))
          rects[id] = { x: at.x, y: at.y }
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

