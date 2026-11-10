import { useEffect, useRef } from 'react'
import { textKeyOf } from '../core/textEdit'
import { locate } from '../core/tree'
import { useIde } from '../store'

interface Item {
  label: string
  shortcut?: string
  disabled?: boolean
  onClick?: () => void
  separator?: boolean
}

/** Menu do botão direito: no componente (editar texto, código, copiar...) ou no fundo do formulário (colar). */
export function ContextMenu(): React.JSX.Element | null {
  const menu = useIde((s) => s.contextMenu)
  const type = useIde((s) => {
    const doc = s.currentDoc()
    return s.contextMenu?.id && doc ? (locate(doc, s.contextMenu.id)?.node.type ?? null) : null
  })
  const hasClipboard = useIde((s) => s.clipboard !== null && s.clipboard.length > 0)
  const ref = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => useIde.getState().closeContextMenu()
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      close()
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  if (!menu) return null
  const ide = useIde.getState()
  const id = menu.id
  const items: Item[] = id
    ? [
        { label: 'Editar texto', shortcut: 'F2', disabled: !type || !textKeyOf(type), onClick: () => ide.startTextEdit(id) },
        { label: 'Abrir código (evento)', shortcut: '2 cliques', onClick: () => ide.openHandler(id) },
        { label: '', separator: true },
        { label: 'Recortar', shortcut: 'Ctrl+X', onClick: ide.cutSelection },
        { label: 'Copiar', shortcut: 'Ctrl+C', onClick: ide.copySelection },
        { label: 'Colar', shortcut: 'Ctrl+V', disabled: !hasClipboard, onClick: ide.pasteClipboard },
        { label: 'Duplicar', shortcut: 'Ctrl+D', onClick: ide.duplicateSelection },
        { label: 'Excluir', shortcut: 'Del', onClick: ide.deleteSelection },
        { label: '', separator: true },
        { label: 'O que é isto? (dicionário)', shortcut: 'F1', onClick: () => ide.openDictionary() }
      ]
    : [
        { label: 'Colar', shortcut: 'Ctrl+V', disabled: !hasClipboard, onClick: ide.pasteClipboard },
        { label: '', separator: true },
        { label: 'Dicionário', shortcut: 'F1', onClick: () => ide.openDictionary() }
      ]

  const left = Math.min(menu.x, window.innerWidth - 240)
  const top = Math.min(menu.y, window.innerHeight - items.length * 24 - 12)
  return (
    <ul ref={ref} className="menu-list context-menu" role="menu" data-testid="context-menu" style={{ left, top }}>
      {items.map((item, k) =>
        item.separator ? (
          <li key={k} className="menu-sep" role="separator" />
        ) : (
          <li key={item.label}>
            <button
              className="menu-item"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                ide.closeContextMenu()
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
  )
}
