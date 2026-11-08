import { useActiveFormDoc, useIde } from '../store'

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
          <div className="form-frame" style={{ width: doc.width }}>
            <div className="form-titlebar">{doc.title}</div>
            <div className="form-surface" style={{ height: doc.height }}>
              <span className="muted">Arraste componentes para cá (M1)</span>
            </div>
          </div>
        ) : (
          <p className="muted">Não foi possível ler o layout deste formulário.</p>
        )}
      </div>
    </section>
  )
}
