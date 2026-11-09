import { useEffect, useRef, useState } from 'react'
import { useIde } from '../store'
import { currentTheme, setTheme } from '../theme'

interface Item {
  label: string
  shortcut?: string
  onClick?: () => void
  disabled?: boolean
  separator?: boolean
}

interface Menu {
  label: string
  items: Item[]
}

export function MenuBar(): React.JSX.Element {
  const [open, setOpen] = useState<number | null>(null)
  const ref = useRef<HTMLElement>(null)
  const busy = useIde((s) => s.busy)
  const hasProject = useIde((s) => s.project !== null)
  const canUndo = useIde((s) => (s.tracked[s.activeForm ?? '']?.undo.length ?? 0) > 0)
  const canRedo = useIde((s) => (s.tracked[s.activeForm ?? '']?.redo.length ?? 0) > 0)
  const hasSelection = useIde((s) => s.selection.length > 0)
  const canRun = useIde((s) => s.activeForm !== null && s.tracked[s.activeForm] !== undefined)
  const running = useIde((s) => s.running)
  const ide = useIde.getState()

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (open === null) return
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const menus: Menu[] = [
    {
      label: 'Arquivo',
      items: [
        { label: 'Novo projeto...', shortcut: 'Ctrl+N', disabled: busy, onClick: () => void ide.newProject() },
        { label: 'Abrir projeto...', shortcut: 'Ctrl+O', disabled: busy, onClick: () => void ide.openProject() },
        { label: 'Salvar', shortcut: 'Ctrl+S', disabled: busy || !hasProject, onClick: () => void ide.saveProject() }
      ]
    },
    {
      label: 'Editar',
      items: [
        { label: 'Desfazer', shortcut: 'Ctrl+Z', disabled: !canUndo, onClick: ide.undo },
        { label: 'Refazer', shortcut: 'Ctrl+Y', disabled: !canRedo, onClick: ide.redo },
        { label: '', separator: true },
        { label: 'Duplicar', shortcut: 'Ctrl+D', disabled: !hasSelection, onClick: ide.duplicateSelection },
        { label: 'Excluir', shortcut: 'Del', disabled: !hasSelection, onClick: ide.deleteSelection },
        { label: 'Limpar seleção', shortcut: 'Esc', disabled: !hasSelection, onClick: () => ide.select([]) }
      ]
    },
    {
      label: 'Exibir',
      items: [
        {
          label: 'Alternar tema claro/escuro',
          onClick: () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
        }
      ]
    },
    {
      label: 'Executar',
      items: [
        { label: 'Executar formulário', shortcut: 'F5', disabled: busy || !canRun, onClick: () => void ide.run() },
        { label: 'Parar', shortcut: 'Shift+F5', disabled: !running, onClick: () => void ide.stop() }
      ]
    }
  ]

  return (
    <nav className="menubar" ref={ref}>
      {menus.map((menu, i) => (
        <div key={menu.label} className="menu-root">
          <button
            className={`menu-title${open === i ? ' open' : ''}`}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
          >
            {menu.label}
          </button>
          {open === i && (
            <ul className="menu-list" role="menu">
              {menu.items.map((item, k) =>
                item.separator ? (
                  <li key={k} className="menu-sep" role="separator" />
                ) : (
                  <li key={item.label}>
                    <button
                      className="menu-item"
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        setOpen(null)
                        item.onClick?.()
                      }}
                    >
                      <span>{item.label}</span>
                      <span className="menu-shortcut">{item.shortcut}</span>
                    </button>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      ))}
    </nav>
  )
}
