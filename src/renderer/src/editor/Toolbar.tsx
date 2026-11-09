import { useIde } from '../store'
import { toggleTheme, useTheme } from '../theme'

export function Toolbar(): React.JSX.Element {
  const hasProject = useIde((s) => s.project !== null)
  const busy = useIde((s) => s.busy)
  const canUndo = useIde((s) => (s.tracked[s.activeForm ?? '']?.undo.length ?? 0) > 0)
  const canRedo = useIde((s) => (s.tracked[s.activeForm ?? '']?.redo.length ?? 0) > 0)
  const canRun = useIde((s) => s.activeForm !== null && s.tracked[s.activeForm] !== undefined)
  const running = useIde((s) => s.running)
  const live = useIde((s) => s.settings.livePreview)
  const theme = useTheme()
  const { newProject, openProject, saveProject, undo, redo, run, stop } = useIde.getState()

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
      <button disabled={busy || !canRun} onClick={() => void run()} title="Executar o formulário (F5)">
        ▶ Executar
      </button>
      <button disabled={!running} onClick={() => void stop()} title="Parar a execução (Shift+F5)">
        ■ Parar
      </button>
      <button
        onClick={() => void useIde.getState().setSetting('livePreview', !live)}
        aria-pressed={live}
        data-testid="toggle-live"
        title="Pré-visualização ao vivo: a janela de execução se atualiza sozinha quando você altera o formulário ou o script"
      >
        {live ? '● Ao vivo' : '○ Ao vivo'}
      </button>
      <span className="toolbar-spacer" />
      <button
        onClick={toggleTheme}
        aria-pressed={theme === 'dark'}
        title="Modo noturno: tema escuro, mais confortável à noite"
        data-testid="toggle-night"
      >
        {theme === 'dark' ? '☀ Modo claro' : '☾ Modo noturno'}
      </button>
    </header>
  )
}
