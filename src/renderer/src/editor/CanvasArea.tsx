import { useActiveFormDoc, useIde } from '../store'
import { DesignSurface } from './DesignSurface'

export function CanvasArea(): React.JSX.Element {
  const forms = useIde((s) => s.project?.manifest.forms ?? [])
  const active = useIde((s) => s.activeForm)
  const setActiveForm = useIde((s) => s.setActiveForm)
  const doc = useActiveFormDoc()

  return (
    <section className="pane canvas-pane">
      <nav className="tabs">
        {forms.map((f) => (
          <button key={f.name} className={`tab${f.name === active ? ' active' : ''}`} onClick={() => setActiveForm(f.name)}>
            {f.layout}
          </button>
        ))}
      </nav>
      <div className="canvas-scroll">
        {doc ? (
          <DesignSurface key={doc.name} doc={doc} />
        ) : (
          <p className="muted">Não foi possível ler o layout deste formulário (veja o Console).</p>
        )}
      </div>
    </section>
  )
}
