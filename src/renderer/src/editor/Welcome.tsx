import { useIde } from '../store'

export function Welcome(): React.JSX.Element {
  const busy = useIde((s) => s.busy)
  const { newProject, openProject } = useIde.getState()

  return (
    <section className="pane welcome">
      <div className="dialog">
        <div className="dialog-title">Bem-vindo ao VForm</div>
        <div className="dialog-body">
          <h1>VForm IDE</h1>
          <p>Monte formulários arrastando componentes e escreva a lógica em Python.</p>
          <div className="welcome-actions">
            <button className="primary" disabled={busy} onClick={() => void newProject()}>
              Novo projeto
            </button>
            <button disabled={busy} onClick={() => void openProject()}>
              Abrir projeto
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
