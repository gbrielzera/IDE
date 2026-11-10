import { useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useIde } from './store'
import { MenuBar } from './editor/MenuBar'
import { Toolbar } from './editor/Toolbar'
import { Palette } from './editor/Palette'
import { OutlineTree } from './editor/OutlineTree'
import { CanvasArea, preloadAndWarmCodeEditor } from './editor/CanvasArea'
import { PropertyPanel } from './editor/PropertyPanel'
import { ConsolePanel } from './editor/ConsolePanel'
import { StatusBar } from './editor/StatusBar'
import { Welcome } from './editor/Welcome'

/** Espera depois da última alteração antes de salvar sozinho. */
const AUTOSAVE_DELAY_MS = 1500

/** Espera depois da primeira tela antes de carregar o editor de código (a IDE abre sem pesar). */
const EDITOR_PRELOAD_DELAY_MS = 600

/** Pausa depois da última alteração antes de atualizar a pré-visualização ao vivo. */
const LIVE_PREVIEW_DELAY_MS = 700

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

function useShortcuts(): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.altKey) return
      const ide = useIde.getState()
      if (e.key === 'F5') {
        e.preventDefault()
        void (e.shiftKey ? ide.stop() : ide.run())
        return
      }
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      if (mod) {
        const handlers: Record<string, () => void> = {
          s: () => void ide.saveProject(),
          o: () => void ide.openProject(),
          n: () => void ide.newProject()
        }
        if (!isTyping(e.target)) {
          handlers.z = e.shiftKey ? ide.redo : ide.undo
          handlers.y = ide.redo
          handlers.d = ide.duplicateSelection
          handlers.c = ide.copySelection
          handlers.x = ide.cutSelection
          handlers.v = ide.pasteClipboard
        }
        const run = handlers[k]
        if (run) {
          e.preventDefault()
          run()
        }
        return
      }

      // Edição direta no canvas: ignorada enquanto se digita em campos de texto.
      if (isTyping(e.target) || !ide.currentDoc()) return
      const step = e.shiftKey ? 10 : 1
      const moves: Record<string, [number, number]> = {
        arrowleft: [-step, 0],
        arrowright: [step, 0],
        arrowup: [0, -step],
        arrowdown: [0, step]
      }
      if (k === 'delete' || k === 'backspace') {
        e.preventDefault()
        ide.deleteSelection()
      } else if (k === 'escape') {
        ide.select([])
      } else if (moves[k] && ide.selection.length > 0) {
        e.preventDefault()
        ide.nudgeSelection(...moves[k])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Saída do Python e fim da execução vêm do processo principal. */
function useRunEvents(): void {
  useEffect(() => {
    const api = window.vform.run
    const offConsole = api.onConsole((m) => useIde.getState().runConsole(m))
    const offEnded = api.onEnded((e) => useIde.getState().runEnded(e))
    return () => {
      offConsole()
      offEnded()
    }
  }, [])
}

/** Preferências guardadas pelo processo principal, e o salvamento automático (se ligado). */
function useSettingsAndAutosave(): void {
  useEffect(() => {
    void useIde.getState().loadSettings()
    let timer: number | undefined
    const unsubscribe = useIde.subscribe((s) => {
      if (!s.settings.autosave || !s.dirty || s.busy || !s.project) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const now = useIde.getState()
        if (now.settings.autosave && now.dirty && !now.busy) void now.saveProject({ silent: true })
      }, AUTOSAVE_DELAY_MS)
    })
    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [])
}

/**
 * Pré-visualização ao vivo: com a opção ligada e uma janela de execução aberta, qualquer mudança no formulário
 * em execução ou no script dele atualiza a janela (depois de uma pausa, para não reiniciar a cada tecla).
 */
function useLivePreview(): void {
  useEffect(() => {
    let timer: number | undefined
    let last: { doc: unknown; script: unknown; form: string | null } | null = null
    const unsubscribe = useIde.subscribe((s) => {
      const form = s.runForm
      const now = { doc: form ? s.tracked[form]?.doc : undefined, script: form ? s.scripts[form] : undefined, form }
      const changed = last !== null && last.form === now.form && (last.doc !== now.doc || last.script !== now.script)
      last = now
      if (!changed || !s.settings.livePreview || !s.running) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const st = useIde.getState()
        if (st.settings.livePreview && st.running) void st.run({ refresh: true })
      }, LIVE_PREVIEW_DELAY_MS)
    })
    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [])
}

/** Carrega o editor de código em segundo plano, sem atrapalhar a primeira tela. */
function useEditorPreload(): void {
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void preloadAndWarmCodeEditor()
          .catch(() => undefined)
          .finally(() => {
            document.documentElement.dataset.editorWarm = '1' // sinal para os testes: a carga pesada acabou
          }),
      EDITOR_PRELOAD_DELAY_MS
    )
    return () => window.clearTimeout(timer)
  }, [])
}

export function App(): React.JSX.Element {
  useEditorPreload()
  useShortcuts()
  useLivePreview()
  useRunEvents()
  useSettingsAndAutosave()
  const hasProject = useIde((s) => s.project !== null)

  return (
    <div className="app">
      <MenuBar />
      <Toolbar />
      <div className="workspace">
        <Group orientation="horizontal">
          <Panel defaultSize={240} minSize={180} maxSize={420}>
            <Group orientation="vertical">
              <Panel defaultSize="55" minSize={120}>
                <Palette />
              </Panel>
              <Separator className="sep sep-h" />
              <Panel minSize={100}>
                <OutlineTree />
              </Panel>
            </Group>
          </Panel>
          <Separator className="sep sep-v" />
          <Panel minSize={360}>
            <Group orientation="vertical">
              <Panel minSize={200}>{hasProject ? <CanvasArea /> : <Welcome />}</Panel>
              <Separator className="sep sep-h" />
              <Panel defaultSize={170} minSize={80}>
                <ConsolePanel />
              </Panel>
            </Group>
          </Panel>
          <Separator className="sep sep-v" />
          <Panel defaultSize={300} minSize={220} maxSize={520}>
            <PropertyPanel />
          </Panel>
        </Group>
      </div>
      <StatusBar />
    </div>
  )
}
