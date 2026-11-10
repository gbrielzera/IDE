import { useEffect, useRef, useState } from 'react'
import { canAlign, canDistribute } from '../core/align'
import { useIde } from '../store'
import { toggleTheme, useTheme } from '../theme'

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
  const autosave = useIde((s) => s.settings.autosave)
  const theme = useTheme()
  const rulers = useIde((s) => s.settings.rulers)
  const live = useIde((s) => s.settings.livePreview)
  const hasClipboard = useIde((s) => s.clipboard !== null && s.clipboard.length > 0)
  const alignable = useIde((s) => {
    const t = s.activeForm ? s.tracked[s.activeForm] : undefined
    return t ? canAlign(t.doc, s.selection) : false
  })
  const distributable = useIde((s) => {
    const t = s.activeForm ? s.tracked[s.activeForm] : undefined
    return t ? canDistribute(t.doc, s.selection) : false
  })
  const formCount = useIde((s) => s.project?.manifest.forms.length ?? 0)
  const activeForm = useIde((s) => s.activeForm)
  const ide = useIde.getState()

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (open === null) return
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null)
    }
    // Em captura e consumindo o evento: com um menu aberto, Esc só fecha o menu (não deve também limpar a
    // seleção de componentes, que é o que o Esc faz fora do menu).
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      setOpen(null)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const menus: Menu[] = [
    {
      label: 'Arquivo',
      items: [
        { label: 'Novo projeto...', shortcut: 'Ctrl+N', disabled: busy, onClick: () => void ide.newProject() },
        { label: 'Abrir projeto...', shortcut: 'Ctrl+O', disabled: busy, onClick: () => void ide.openProject() },
        { label: 'Salvar', shortcut: 'Ctrl+S', disabled: busy || !hasProject, onClick: () => void ide.saveProject() },
        { label: '', separator: true },
        { label: 'Nova tela...', disabled: !hasProject, onClick: () => ide.openFormDialog({ kind: 'new' }) },
        {
          label: 'Remover tela atual...',
          disabled: !hasProject || formCount <= 1 || !activeForm,
          onClick: () => activeForm && ide.openFormDialog({ kind: 'remove', name: activeForm })
        },
        { label: '', separator: true },
        {
          label: `${autosave ? '✓ ' : '    '}Salvar automaticamente`,
          onClick: () => void ide.setSetting('autosave', !autosave)
        }
      ]
    },
    {
      label: 'Editar',
      items: [
        { label: 'Desfazer', shortcut: 'Ctrl+Z', disabled: !canUndo, onClick: ide.undo },
        { label: 'Refazer', shortcut: 'Ctrl+Y', disabled: !canRedo, onClick: ide.redo },
        { label: '', separator: true },
        { label: 'Recortar', shortcut: 'Ctrl+X', disabled: !hasSelection, onClick: ide.cutSelection },
        { label: 'Copiar', shortcut: 'Ctrl+C', disabled: !hasSelection, onClick: ide.copySelection },
        { label: 'Colar', shortcut: 'Ctrl+V', disabled: !hasClipboard, onClick: ide.pasteClipboard },
        { label: 'Duplicar', shortcut: 'Ctrl+D', disabled: !hasSelection, onClick: ide.duplicateSelection },
        { label: 'Excluir', shortcut: 'Del', disabled: !hasSelection, onClick: ide.deleteSelection },
        { label: 'Limpar seleção', shortcut: 'Esc', disabled: !hasSelection, onClick: () => ide.select([]) }
      ]
    },
    {
      label: 'Organizar',
      items: [
        { label: 'Alinhar à esquerda', disabled: !alignable, onClick: () => ide.alignSelection('left') },
        { label: 'Alinhar ao centro (horizontal)', disabled: !alignable, onClick: () => ide.alignSelection('hcenter') },
        { label: 'Alinhar à direita', disabled: !alignable, onClick: () => ide.alignSelection('right') },
        { label: '', separator: true },
        { label: 'Alinhar ao topo', disabled: !alignable, onClick: () => ide.alignSelection('top') },
        { label: 'Alinhar ao meio (vertical)', disabled: !alignable, onClick: () => ide.alignSelection('vmiddle') },
        { label: 'Alinhar à base', disabled: !alignable, onClick: () => ide.alignSelection('bottom') },
        { label: '', separator: true },
        { label: 'Distribuir na horizontal', disabled: !distributable, onClick: () => ide.distributeSelection('h') },
        { label: 'Distribuir na vertical', disabled: !distributable, onClick: () => ide.distributeSelection('v') }
      ]
    },
    {
      label: 'Exibir',
      items: [
        {
          label: `${rulers ? '✓ ' : '    '}Réguas`,
          onClick: () => void ide.setSetting('rulers', !rulers)
        },
        {
          label: `${theme === 'dark' ? '✓ ' : '    '}Modo noturno (tema escuro)`,
          onClick: toggleTheme
        }
      ]
    },
    {
      label: 'Executar',
      items: [
        { label: 'Executar formulário', shortcut: 'F5', disabled: busy || !canRun, onClick: () => void ide.run() },
        { label: 'Parar', shortcut: 'Shift+F5', disabled: !running, onClick: () => void ide.stop() },
        { label: '', separator: true },
        {
          label: `${live ? '✓ ' : '    '}Pré-visualização ao vivo`,
          onClick: () => void ide.setSetting('livePreview', !live)
        }
      ]
    },
    {
      label: 'Ajuda',
      items: [
        { label: 'Dicionário de componentes', shortcut: 'F1', onClick: () => ide.openDictionary() },
        { label: 'Manual do usuário (.chm)', onClick: () => void ide.openManual() }
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
