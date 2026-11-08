import { useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useIde } from './store'
import { Toolbar } from './editor/Toolbar'
import { Palette } from './editor/Palette'
import { OutlineTree } from './editor/OutlineTree'
import { CanvasArea } from './editor/CanvasArea'
import { PropertyPanel } from './editor/PropertyPanel'
import { ConsolePanel } from './editor/ConsolePanel'
import { StatusBar } from './editor/StatusBar'
import { Welcome } from './editor/Welcome'

function useShortcuts(): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.key.toLowerCase()
      const ide = useIde.getState()
      if (k === 's') {
        e.preventDefault()
        void ide.saveProject()
      } else if (k === 'o') {
        e.preventDefault()
        void ide.openProject()
      } else if (k === 'n') {
        e.preventDefault()
        void ide.newProject()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function App(): React.JSX.Element {
  useShortcuts()
  const hasProject = useIde((s) => s.project !== null)

  return (
    <div className="app">
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
