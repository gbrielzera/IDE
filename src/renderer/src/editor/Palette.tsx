import { CATALOG } from '../components/catalog'
import { useIde } from '../store'
import { DRAG_MIME } from './DesignSurface'

export function Palette(): React.JSX.Element {
  const hasProject = useIde((s) => s.project !== null)

  function addAtCascade(type: string): void {
    const doc = useIde.getState().currentDoc()
    if (!doc) return
    const offset = 16 + (doc.children.length % 10) * 16
    useIde.getState().addComponent(type, null, offset, offset)
  }

  return (
    <section className="pane">
      <h2 className="pane-title">Componentes</h2>
      <ul className="pane-body palette">
        {CATALOG.map((c) => (
          <li
            key={c.type}
            className="palette-item"
            draggable={hasProject}
            title="Arraste para o canvas ou dê dois cliques"
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, c.type)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onDoubleClick={() => addAtCascade(c.type)}
          >
            {c.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
