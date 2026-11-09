import { useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useIde } from './store'
import { MenuBar } from './editor/MenuBar'
import { Toolbar } from './editor/Toolbar'
import { Palette } from './editor/Palette'
import { OutlineTree } from './editor/OutlineTree'
import { CanvasArea } from './editor/CanvasArea'
import { PropertyPanel } from './editor/PropertyPanel'
import { ConsolePanel } from './editor/ConsolePanel'
import { StatusBar } from './editor/StatusBar'
import { Welcome } from './editor/Welcome'

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
    const offConsole = api.onConsole((m) => useIde.getState().log(m.level, m.text))
    const offEnded = api.onEnded((e) => useIde.getState().runEnded(e))
    return () => {
      offConsole()
      offEnded()
    }
  }, [])
}

export function App(): React.JSX.Element {
  useShortcuts()
  useRunEvents()
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
