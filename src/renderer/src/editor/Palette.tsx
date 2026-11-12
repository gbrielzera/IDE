import { useEffect, useRef, useState } from 'react'
import { CATALOG } from '../components/catalog'
import { COMPONENT_HELP } from '../core/glossary'
import { useIde } from '../store'
import { ComponentPreview } from './ComponentPreview'
import { DRAG_MIME } from './DesignSurface'

/** Quanto o cursor precisa ficar parado sobre o item antes da prévia aparecer. */
export const HOVER_PREVIEW_MS = 800

/** Categorias na ordem em que aparecem no registro. */
const CATEGORIES = [...new Set(CATALOG.map((c) => c.category))]

interface Hover {
  type: string
  x: number
  y: number
}

export function Palette(): React.JSX.Element {
  const hasProject = useIde((s) => s.project !== null)
  const [hover, setHover] = useState<Hover | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function stopHover(): void {
    window.clearTimeout(timer.current)
    setHover(null)
  }

  function startHover(type: string, el: HTMLElement): void {
    stopHover()
    const r = el.getBoundingClientRect()
    timer.current = window.setTimeout(() => setHover({ type, x: r.right + 8, y: r.top }), HOVER_PREVIEW_MS)
  }

  function addAtCascade(type: string): void {
    const doc = useIde.getState().currentDoc()
    if (!doc) return
    const offset = 16 + (doc.children.length % 10) * 16
    useIde.getState().addComponent(type, null, offset, offset)
  }

  const help = hover ? COMPONENT_HELP[hover.type] : undefined

  return (
    <section className="pane">
      <h2 className="pane-title">Componentes</h2>
      <ul className="pane-body palette">
        {CATEGORIES.map((category) => (
          <li key={category} className="palette-group">
            <span className="palette-category">{category}</span>
            <ul>
              {CATALOG.filter((c) => c.category === category).map((c) => (
              <li
                key={c.type}
                className="palette-item"
                draggable={hasProject}
                onMouseEnter={(e) => startHover(c.type, e.currentTarget)}
                onMouseLeave={stopHover}
                onMouseDown={stopHover}
                onDragStart={(e) => {
                  stopHover()
                  e.dataTransfer.setData(DRAG_MIME, c.type)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onDoubleClick={() => {
                  stopHover()
                  addAtCascade(c.type)
                }}
              >
                {c.label}
              </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {hover && (
        <div className="hover-card" role="tooltip" data-testid="hover-card" style={{ left: hover.x, top: Math.min(hover.y, window.innerHeight - 260) }}>
          <strong>{hover.type}</strong>
          <div className="hover-preview">
            <ComponentPreview type={hover.type} />
          </div>
          {help && <p>{help.resumo}</p>}
          {help && <small>{help.paraQue}</small>}
          <small className="hover-hint">Arraste para o canvas ou dê dois cliques · F1 abre o dicionário</small>
        </div>
      )}
    </section>
  )
}
