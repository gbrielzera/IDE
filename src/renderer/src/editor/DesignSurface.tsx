import { useRef, useState } from 'react'
import type { FormDocument, FormNode } from '@shared/project'
import { CATALOG_BY_TYPE } from '../components/catalog'
import { renderContent } from '../components/render'
import { MIN_SIZE, reparentNodes, setRects } from '../core/commands'
import { locate, topmost } from '../core/tree'
import { useIde } from '../store'

export const DRAG_MIME = 'application/x-vform-type'
const GRID = 8
const DRAG_THRESHOLD = 4

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

interface Box {
  x: number
  y: number
  w: number
  h: number
}

let txnCounter = 0
const newTxn = (kind: string): string => `${kind}-${++txnCounter}`

/** Encaixa na grade; com Alt apertado só arredonda para pixel inteiro. */
function snap(value: number, grid: boolean): number {
  return grid ? Math.round(value / GRID) * GRID : Math.round(value)
}

function isAdditive(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.shiftKey || e.ctrlKey || e.metaKey
}

/** Container (Panel) sob o ponteiro, ignorando os nós arrastados e o que está dentro deles. */
function containerAt(clientX: number, clientY: number, exclude: ReadonlySet<string>): string | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (!(el instanceof HTMLElement) || el.dataset.container !== 'true' || !el.dataset.nodeId) continue
    let excluded = false
    for (let p: HTMLElement | null = el; p; p = p.parentElement) {
      if (p.dataset.nodeId && exclude.has(p.dataset.nodeId)) excluded = true
    }
    if (!excluded) return el.dataset.nodeId
  }
  return null
}

function onPaletteDragOver(e: React.DragEvent): void {
  if (e.dataTransfer.types.includes(DRAG_MIME)) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
}

interface NodeViewProps {
  node: FormNode
  selected: ReadonlySet<string>
  showHandles: boolean
  onNodeDown(e: React.PointerEvent, node: FormNode): void
  onHandleDown(e: React.PointerEvent, node: FormNode, handle: Handle): void
}

function NodeView({ node, selected, showHandles, onNodeDown, onHandleDown }: NodeViewProps): React.JSX.Element {
  const isSelected = selected.has(node.id)
  const container = CATALOG_BY_TYPE[node.type]?.container === true
  return (
    <div
      className={`node${isSelected ? ' selected' : ''}`}
      data-node-id={node.id}
      data-container={container ? 'true' : undefined}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onPointerDown={(e) => onNodeDown(e, node)}
    >
      <div className="node-content">{renderContent(node)}</div>
      {node.children?.map((child) => (
        <NodeView
          key={child.id}
          node={child}
          selected={selected}
          showHandles={showHandles}
          onNodeDown={onNodeDown}
          onHandleDown={onHandleDown}
        />
      ))}
      {isSelected && <span className="node-tag">{node.id}</span>}
      {isSelected &&
        showHandles &&
        HANDLES.map((h) => (
          <span key={h} className={`handle handle-${h}`} onPointerDown={(e) => onHandleDown(e, node, h)} />
        ))}
    </div>
  )
}

export function DesignSurface({ doc }: { doc: FormDocument }): React.JSX.Element {
  const selection = useIde((s) => s.selection)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [marquee, setMarquee] = useState<Box | null>(null)
  const selected = new Set(selection)

  /**
   * Acompanha o gesto até soltar o botão, mesmo se o ponteiro sair do canvas.
   * O ponteiro fica "capturado" pelo canvas (que nunca é recriado durante o gesto): sem isso o
   * navegador pode assumir o gesto (arraste nativo, toque) e cancelar o arraste após poucos pixels.
   */
  function track(pointerId: number, onMove: (e: PointerEvent) => void, onUp: (e: PointerEvent) => void): void {
    const surface = surfaceRef.current
    try {
      surface?.setPointerCapture(pointerId)
    } catch {
      // Sem captura o arraste continua funcionando pelos listeners da janela.
    }
    const up = (e: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      try {
        surface?.releasePointerCapture(pointerId)
      } catch {
        // Já liberado pelo navegador.
      }
      onUp(e)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  function onNodeDown(e: React.PointerEvent, node: FormNode): void {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault() // impede seleção de texto/arraste nativo iniciados por este clique
    const ide = useIde.getState()

    let sel = ide.selection
    if (isAdditive(e)) {
      sel = sel.includes(node.id) ? sel.filter((id) => id !== node.id) : [...sel, node.id]
      ide.select(sel)
      if (!sel.includes(node.id)) return
    } else if (!sel.includes(node.id)) {
      sel = [node.id]
      ide.select(sel)
    }

    const current = ide.currentDoc()
    if (!current) return
    const ids = topmost(current, sel)
    const origins: Record<string, { x: number; y: number }> = {}
    for (const id of ids) {
      const n = locate(current, id)?.node
      if (n) origins[id] = { x: n.x, y: n.y }
    }
    const primary = origins[node.id] ? node.id : ids[0]
    if (!primary) return
    const minX = Math.min(...ids.map((id) => origins[id].x))
    const minY = Math.min(...ids.map((id) => origins[id].y))
    const startX = e.clientX
    const startY = e.clientY
    const txn = newTxn('move')
    let moved = false

    track(
      e.pointerId,
      (ev) => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        moved = true
        const grid = !ev.altKey
        const ddx = Math.max(snap(origins[primary].x + dx, grid) - origins[primary].x, -minX)
        const ddy = Math.max(snap(origins[primary].y + dy, grid) - origins[primary].y, -minY)
        const rects: Record<string, { x: number; y: number }> = {}
        for (const id of ids) rects[id] = { x: origins[id].x + ddx, y: origins[id].y + ddy }
        useIde.getState().edit((d) => setRects(d, rects), txn)
      },
      (ev) => {
        if (!moved) return
        const target = containerAt(ev.clientX, ev.clientY, new Set(ids))
        useIde.getState().edit((d) => reparentNodes(d, ids, target), txn)
      }
    )
  }

  function onHandleDown(e: React.PointerEvent, node: FormNode, handle: Handle): void {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const o = { x: node.x, y: node.y, w: node.width, h: node.height }
    const startX = e.clientX
    const startY = e.clientY
    const txn = newTxn('resize')

    track(
      e.pointerId,
      (ev) => {
        const grid = !ev.altKey
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        let { x, y, w, h } = o
        if (handle.includes('e')) w = Math.max(MIN_SIZE, snap(o.x + o.w + dx, grid) - o.x)
        if (handle.includes('s')) h = Math.max(MIN_SIZE, snap(o.y + o.h + dy, grid) - o.y)
        if (handle.includes('w')) {
          x = Math.max(0, Math.min(snap(o.x + dx, grid), o.x + o.w - MIN_SIZE))
          w = o.x + o.w - x
        }
        if (handle.includes('n')) {
          y = Math.max(0, Math.min(snap(o.y + dy, grid), o.y + o.h - MIN_SIZE))
          h = o.y + o.h - y
        }
        useIde.getState().edit((d) => setRects(d, { [node.id]: { x, y, width: w, height: h } }), txn)
      },
      () => {}
    )
  }

  function onSurfaceDown(e: React.PointerEvent): void {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    const surface = surfaceRef.current
    if (!surface) return
    e.preventDefault()
    const ide = useIde.getState()
    const additive = isAdditive(e)
    const base = additive ? ide.selection : []
    if (!additive) ide.select([])

    const origin = surface.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY

    track(
      e.pointerId,
      (ev) => {
        const x1 = Math.min(startX, ev.clientX)
        const y1 = Math.min(startY, ev.clientY)
        const x2 = Math.max(startX, ev.clientX)
        const y2 = Math.max(startY, ev.clientY)
        if (x2 - x1 < DRAG_THRESHOLD && y2 - y1 < DRAG_THRESHOLD) return
        setMarquee({ x: x1 - origin.left, y: y1 - origin.top, w: x2 - x1, h: y2 - y1 })
        const hits: string[] = []
        for (const el of surface.querySelectorAll<HTMLElement>(':scope > .node')) {
          const r = el.getBoundingClientRect()
          if (r.left < x2 && r.right > x1 && r.top < y2 && r.bottom > y1 && el.dataset.nodeId) hits.push(el.dataset.nodeId)
        }
        useIde.getState().select([...new Set([...base, ...hits])])
      },
      () => setMarquee(null)
    )
  }

  function onDrop(e: React.DragEvent): void {
    const type = e.dataTransfer.getData(DRAG_MIME)
    if (!type) return
    e.preventDefault()
    const hostEl = (e.target as HTMLElement).closest<HTMLElement>('[data-container="true"]')
    const parentId = hostEl?.dataset.nodeId ?? null
    const rect = (hostEl ?? surfaceRef.current)?.getBoundingClientRect()
    if (!rect) return
    const x = snap(e.clientX - rect.left, true)
    const y = snap(e.clientY - rect.top, true)
    useIde.getState().addComponent(type, parentId, x, y)
  }

  return (
    <div className="form-frame" style={{ width: doc.width }}>
      <div className="form-titlebar">
        <span className="form-title-text">{doc.title}</span>
        <span className="wincaps" aria-hidden="true">
          <i>_</i>
          <i>□</i>
          <i>×</i>
        </span>
      </div>
      <div
        ref={surfaceRef}
        className="form-surface"
        data-testid="surface"
        style={{ height: doc.height }}
        onPointerDown={onSurfaceDown}
        onDragStart={(e) => e.preventDefault()}
        onDragOver={onPaletteDragOver}
        onDrop={onDrop}
      >
        {doc.children.length === 0 && <span className="surface-hint">Arraste componentes da paleta para cá</span>}
        {doc.children.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            selected={selected}
            showHandles={selection.length === 1}
            onNodeDown={onNodeDown}
            onHandleDown={onHandleDown}
          />
        ))}
        {marquee && (
          <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />
        )}
      </div>
    </div>
  )
}
