import { useState } from 'react'
import { useIde } from '../store'
import { currentTheme, setTheme, type Theme } from '../theme'

export function Toolbar(): React.JSX.Element {
  const hasProject = useIde((s) => s.project !== null)
  const busy = useIde((s) => s.busy)
  const { newProject, openProject, saveProject } = useIde.getState()
  const [theme, setThemeState] = useState<Theme>(currentTheme)

  function toggleTheme(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  return (
    <header className="toolbar">
      <span className="brand">VForm</span>
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
      <button disabled title="Executar o formulário (F5) — chega no M3">
        ▶ Executar
      </button>
      <span className="toolbar-spacer" />
      <button onClick={toggleTheme} title="Alternar tema claro/escuro">
        {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
      </button>
    </header>
  )
}
