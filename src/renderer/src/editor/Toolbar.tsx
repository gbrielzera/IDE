import { useIde } from '../store'

export function Toolbar(): React.JSX.Element {
  const hasProject = useIde((s) => s.project !== null)
  const busy = useIde((s) => s.busy)
  const canUndo = useIde((s) => (s.tracked[s.activeForm ?? '']?.undo.length ?? 0) > 0)
  const canRedo = useIde((s) => (s.tracked[s.activeForm ?? '']?.redo.length ?? 0) > 0)
  const { newProject, openProject, saveProject, undo, redo } = useIde.getState()

  return (
    <header className="toolbar">
      <button disabled={busy} onClick={() => void newProject()} title="Novo projeto (Ctrl+N)">
        Novo
      </button>
      <button disabled={busy} onClick={() => void openProject()} title="Abrir projeto (Ctrl+O)">
        Abrir
      </button>
      <button disabled={busy || !hasProject} onClick={() => void saveProject()} title="Salvar (Ctrl+S)">
        Salvar
      </button>
      <span className="toolbar-sep" />
      <button disabled={!canUndo} onClick={undo} title="Desfazer (Ctrl+Z)">
        Desfazer
      </button>
      <button disabled={!canRedo} onClick={redo} title="Refazer (Ctrl+Y)">
        Refazer
      </button>
      <span className="toolbar-sep" />
      <button disabled title="Executar o formulário (F5) — chega no M3">
        ▶ Executar
      </button>
    </header>
  )
}
