import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getProp } from '../core/props'
import { textKeyOf } from '../core/textEdit'
import { locate } from '../core/tree'
import { useIde } from '../store'

/** Caixa de edição do texto do componente, em cima dele no canvas (F2 ou menu do botão direito). */
export function TextEditOverlay(): React.JSX.Element | null {
  const id = useIde((s) => s.editingText)
  const node = useIde((s) => {
    const doc = s.currentDoc()
    return s.editingText && doc ? (locate(doc, s.editingText)?.node ?? null) : null
  })
  const key = node ? textKeyOf(node.type) : null
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useLayoutEffect(() => {
    if (!id || !node || !key) {
      setRect(null)
      return
    }
    done.current = false
    setValue(String(getProp(node, key) ?? ''))
    setRect(document.querySelector(`[data-node-id="${CSS.escape(id)}"]`)?.getBoundingClientRect() ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (rect) {
      input.current?.focus()
      input.current?.select()
    }
  }, [rect])

  if (!id || !node || !key || !rect) return null

  function finish(commit: boolean): void {
    if (done.current) return
    done.current = true
    const ide = useIde.getState()
    if (commit && node && key && value !== String(getProp(node, key) ?? '')) ide.setProp(node.id, key, value)
    ide.stopTextEdit()
  }

  return (
    <input
      ref={input}
      className="text-edit"
      data-testid="text-edit"
      aria-label={`Texto de ${node.id}`}
      value={value}
      style={{ left: rect.left, top: rect.top, width: Math.max(rect.width, 90), height: Math.max(rect.height, 22) }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  )
}
