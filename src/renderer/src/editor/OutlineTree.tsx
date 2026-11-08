import { useIde } from '../store'

export function OutlineTree(): React.JSX.Element {
  const forms = useIde((s) => s.project?.manifest.forms)
  const active = useIde((s) => s.activeForm)
  const setActiveForm = useIde((s) => s.setActiveForm)

  return (
    <section className="pane">
      <h2 className="pane-title">Estrutura</h2>
      <div className="pane-body">
        {!forms ? (
          <p className="muted">Nenhum projeto aberto.</p>
        ) : (
          <ul className="tree">
            {forms.map((f) => (
              <li key={f.name}>
                <button
                  className={`tree-item${f.name === active ? ' active' : ''}`}
                  onClick={() => setActiveForm(f.name)}
                >
                  ▾ {f.name}
                </button>
                <p className="muted tree-empty">sem componentes</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
