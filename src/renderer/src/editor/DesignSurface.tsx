import { useRef, useState } from 'react'
import type { FormDocument, FormNode } from '@shared/project'
import { CATALOG_BY_TYPE } from '../components/catalog'
import { childBoxStyle, childrenLayerStyle } from '../components/layoutStyle'
import { appearanceStyle, renderContent } from '../components/render'
import { contentSize, minContentSize } from '../core/bounds'
import { MIN_SIZE, moveToIndex, reparentNodes, setFormProps, setRects, type Rect } from '../core/commands'
import { linesOf, snapToGuides, type Lines } from '../core/guides'
import { activeTab, getProp, layoutOf, type LayoutMode } from '../core/props'
import { absPos, insetTop, locate, topmost } from '../core/tree'
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

interface Point {
  x: number
  y: number
}

let txnCounter = 0

/**
 * Duplo clique num componente (abre o handler no código). Não dá para usar o evento `dblclick`: o canvas
 * captura o ponteiro ao apertar o botão (para o arraste não ser cancelado) e o Chromium então entrega o
 * `dblclick` ao canvas, não ao componente. Por isso o duplo clique é reconhecido aqui, na segunda pressão.
 */
const DOUBLE_CLICK_MS = 450
const DOUBLE_CLICK_SLOP = 6
let lastNodeDown: { id: string; time: number; x: number; y: number } | null = null
const newTxn = (kind: string): string => `${kind}-${++txnCounter}`

/** Encaixa na grade; com Alt apertado só arredonda para pixel inteiro. */
function snap(value: number, grid: boolean): number {
  return grid ? Math.round(value / GRID) * GRID : Math.round(value)
}

function isAdditive(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.shiftKey || e.ctrlKey || e.metaKey
}

// ---------- Consultas ao DOM (posições reais na tela) ----------

function nodeEl(surface: HTMLElement, id: string): HTMLElement | null {
  return surface.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)
}

/** Elemento onde os filhos do container são posicionados (o próprio formulário, se `id` for nulo). */
function layerOf(surface: HTMLElement, id: string | null): HTMLElement {
  if (!id) return surface
  return surface.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"] > .children-layer`) ?? surface
}

/** Canto superior esquerdo da área interna (sem a borda) em coordenadas de tela. */
function originOf(el: HTMLElement): Point {
  const r = el.getBoundingClientRect()
  return { x: r.left + el.clientLeft, y: r.top + el.clientTop }
}

/** Container (Panel/Tabs) sob o ponteiro, ignorando os nós arrastados e o que está dentro deles. */
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

/** Posição (na lista de filhos) em que o ponteiro inseriria um item num container com auto-layout. */
function insertionIndex(layer: HTMLElement, mode: LayoutMode, pointer: Point, exclude: ReadonlySet<string>): number {
  let index = 0
  for (const el of layer.querySelectorAll<HTMLElement>(':scope > .node')) {
    if (el.dataset.nodeId && exclude.has(el.dataset.nodeId)) continue
    const r = el.getBoundingClientRect()
    const mid = mode === 'vertical' ? r.top + r.height / 2 : r.left + r.width / 2
    if ((mode === 'vertical' ? pointer.y : pointer.x) > mid) index++
  }
  return index
}

function onPaletteDragOver(e: React.DragEvent): void {
  if (e.dataTransfer.types.includes(DRAG_MIME)) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
}

/** Filhos visíveis: num Tabs, só os da aba selecionada. */
function visibleChildren(node: FormNode): FormNode[] {
  const all = node.children ?? []
  return node.type === 'Tabs' ? all.filter((c) => (c.tab ?? 0) === activeTab(node)) : all
}

interface NodeViewProps {
  node: FormNode
  parent: FormNode | null
  selected: ReadonlySet<string>
  showHandles: boolean
  onNodeDown(e: React.PointerEvent, node: FormNode): void
  onHandleDown(e: React.PointerEvent, node: FormNode, handle: Handle): void
}

function NodeView({ node, parent, selected, showHandles, onNodeDown, onHandleDown }: NodeViewProps): React.JSX.Element {
  const isSelected = selected.has(node.id)
  const container = CATALOG_BY_TYPE[node.type]?.container === true
  const parentLayout = parent ? layoutOf(parent) : null
  const auto = parentLayout && parentLayout.mode !== 'absolute' ? parentLayout : null

  // Em auto-layout o pai posiciona o filho (x/y não valem); no resto, posição absoluta.
  const style = childBoxStyle(node, auto)
  const own = layoutOf(node)
  const layerStyle = childrenLayerStyle(node)

  const classes = ['node']
  if (isSelected) classes.push('selected')
  if (getProp(node, 'visible') === false) classes.push('is-hidden')
  if (getProp(node, 'enabled') === false) classes.push('is-disabled')

  return (
    <div
      className={classes.join(' ')}
      data-node-id={node.id}
      data-container={container ? 'true' : undefined}
      style={style}
      onPointerDown={(e) => onNodeDown(e, node)}
    >
      <div className="node-content" style={appearanceStyle(node)}>
        {renderContent(node)}
      </div>
      {node.children && (
        <div className={`children-layer${own.mode !== 'absolute' ? ' auto' : ''}`} style={layerStyle}>
          {visibleChildren(node).map((child) => (
            <NodeView
              key={child.id}
              node={child}
              parent={node}
              selected={selected}
              showHandles={showHandles}
              onNodeDown={onNodeDown}
              onHandleDown={onHandleDown}
            />
          ))}
        </div>
      )}
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
  /** Linhas de alinhamento mostradas enquanto se arrasta (em coordenadas do formulário). */
  const [guides, setGuides] = useState<{ v: number[]; h: number[] } | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
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

  /** Conclui um arraste: reordena num auto-layout ou muda os nós de container. */
  function finishDrop(
    ids: string[],
    target: string | null,
    ev: PointerEvent,
    txn: string,
    leaving: { primary: string; grab: Point } | null
  ): void {
    const surface = surfaceRef.current
    const ide = useIde.getState()
    const current = ide.currentDoc()
    if (!surface || !current) return
    const targetNode = target ? (locate(current, target)?.node ?? null) : null
    const targetLayout = targetNode ? layoutOf(targetNode) : null
    const pointer = { x: ev.clientX, y: ev.clientY }

    if (target && targetLayout && targetLayout.mode !== 'absolute') {
      const index = insertionIndex(layerOf(surface, target), targetLayout.mode, pointer, new Set(ids))
      ide.edit((d) => ids.forEach((id, i) => moveToIndex(d, id, target, index + i)), txn)
      return
    }
    let positions: Record<string, Point> | undefined
    if (leaving) {
      // Quem sai de um auto-layout não tem posição própria: usa onde o ponteiro soltou.
      const o = originOf(layerOf(surface, target))
      const grid = !ev.altKey
      positions = {
        [leaving.primary]: {
          x: snap(ev.clientX - leaving.grab.x - o.x, grid),
          y: snap(ev.clientY - leaving.grab.y - o.y, grid)
        }
      }
    }
    ide.edit((d) => reparentNodes(d, ids, target, positions), txn)
  }

  function onNodeDown(e: React.PointerEvent, node: FormNode): void {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault() // impede seleção de texto/arraste nativo iniciados por este clique
    const ide = useIde.getState()

    // Clique no cabeçalho de uma aba: só troca de aba.
    const tabEl = (e.target as HTMLElement).closest<HTMLElement>('[data-tab-index]')
    if (node.type === 'Tabs' && tabEl) {
      ide.select([node.id])
      ide.setProp(node.id, 'selectedIndex', Number(tabEl.dataset.tabIndex))
      return
    }

    if (!isAdditive(e)) {
      const prev = lastNodeDown
      lastNodeDown = { id: node.id, time: e.timeStamp, x: e.clientX, y: e.clientY }
      if (
        prev &&
        prev.id === node.id &&
        e.timeStamp - prev.time < DOUBLE_CLICK_MS &&
        Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_CLICK_SLOP
      ) {
        lastNodeDown = null
        ide.select([node.id])
        ide.openHandler(node.id)
        return
      }
    }

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
    const surface = surfaceRef.current
    if (!current || !surface) return
    let ids = topmost(current, sel)
    const primary = ids.includes(node.id) ? node.id : ids[0]
    if (!primary) return
    const parent = locate(current, primary)?.parent ?? null
    const parentLayout = parent ? layoutOf(parent) : null
    const auto = parent && parentLayout && parentLayout.mode !== 'absolute' ? { parent, layout: parentLayout } : null
    if (auto) ids = [primary] // em auto-layout arrasta-se um item por vez (reordenar)

    const grabRect = nodeEl(surface, primary)?.getBoundingClientRect()
    const grab = grabRect ? { x: e.clientX - grabRect.left, y: e.clientY - grabRect.top } : { x: 0, y: 0 }
    const origins: Record<string, Point> = {}
    for (const id of ids) {
      const n = locate(current, id)?.node
      if (n) origins[id] = { x: n.x, y: n.y }
    }
    // Limites: ninguém sai da área do pai (esquerda/topo e direita/base).
    let loX = -Infinity
    let hiX = Infinity
    let loY = -Infinity
    let hiY = Infinity
    const sizes: Record<string, Point> = {}
    for (const id of ids) {
      const loc = locate(current, id)
      if (!loc || !origins[id]) continue
      const area = contentSize(current, loc.parent?.id ?? null)
      sizes[id] = { x: loc.node.width, y: loc.node.height }
      loX = Math.max(loX, -origins[id].x)
      hiX = Math.min(hiX, area.width - loc.node.width - origins[id].x)
      loY = Math.max(loY, -origins[id].y)
      hiY = Math.min(hiY, area.height - loc.node.height - origins[id].y)
    }
    hiX = Math.max(hiX, loX) // um componente maior que a área não trava o arraste
    hiY = Math.max(hiY, loY)

    // Alvos das guias: irmãos (que não estão sendo arrastados) e a própria área do pai.
    const siblings = (parent ? (parent.children ?? []) : current.children).filter(
      (n) => !ids.includes(n.id) && (parent?.type !== 'Tabs' || (n.tab ?? 0) === (locate(current, primary)?.node.tab ?? 0))
    )
    const areaOfParent = contentSize(current, parent?.id ?? null)
    const targets: Rect[] = [
      { x: 0, y: 0, width: areaOfParent.width, height: areaOfParent.height },
      ...siblings.map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }))
    ]
    const parentAbs = parent ? absPos(current, parent.id) : null
    const guideOrigin = { x: parentAbs?.x ?? 0, y: (parentAbs?.y ?? 0) + (parent ? insetTop(parent) : 0) }
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
        lastNodeDown = null // um toque que virou arrasto não conta como primeiro clique de um duplo clique

        if (auto) {
          // Reordena ao vivo enquanto o ponteiro estiver dentro do container.
          const layer = layerOf(surface, auto.parent.id)
          const r = layer.getBoundingClientRect()
          if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return
          const index = insertionIndex(layer, auto.layout.mode, { x: ev.clientX, y: ev.clientY }, new Set([primary]))
          useIde.getState().edit((d) => moveToIndex(d, primary, auto.parent.id, index), txn)
          return
        }

        const grid = !ev.altKey
        let ddx = snap(origins[primary].x + dx, grid) - origins[primary].x
        let ddy = snap(origins[primary].y + dy, grid) - origins[primary].y
        if (grid) {
          // Guias inteligentes: a caixa que envolve o que está sendo arrastado gruda nas bordas/centros dos vizinhos.
          let left = Infinity
          let top = Infinity
          let right = -Infinity
          let bottom = -Infinity
          for (const id of ids) {
            if (!sizes[id]) continue
            left = Math.min(left, origins[id].x + ddx)
            top = Math.min(top, origins[id].y + ddy)
            right = Math.max(right, origins[id].x + ddx + sizes[id].x)
            bottom = Math.max(bottom, origins[id].y + ddy + sizes[id].y)
          }
          const hit = snapToGuides(linesOf({ x: left, y: top, width: right - left, height: bottom - top }), targets)
          ddx += hit.dx
          ddy += hit.dy
          setGuides({ v: hit.v.map((x) => guideOrigin.x + x), h: hit.h.map((y) => guideOrigin.y + y) })
        } else setGuides(null)
        ddx = Math.min(Math.max(ddx, loX), hiX)
        ddy = Math.min(Math.max(ddy, loY), hiY)
        const rects: Record<string, Point> = {}
        for (const id of ids) rects[id] = { x: origins[id].x + ddx, y: origins[id].y + ddy }
        useIde.getState().edit((d) => setRects(d, rects), txn)
      },
      (ev) => {
        setGuides(null)
        if (!moved) return
        const target = containerAt(ev.clientX, ev.clientY, new Set(ids))
        if (auto && target === auto.parent.id) return // só reordenou dentro do mesmo container
        finishDrop(ids, target, ev, txn, auto ? { primary, grab } : null)
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

    const current = useIde.getState().currentDoc()
    const loc = current ? locate(current, node.id) : null
    const parent = loc?.parent ?? null
    const free = !parent || layoutOf(parent).mode === 'absolute' // em auto-layout o pai manda na posição
    const area = current ? contentSize(current, parent?.id ?? null) : { width: Infinity, height: Infinity }
    // Um container não encolhe a ponto de deixar filhos de fora.
    const content = minContentSize(node.children ?? [], node)
    const minW = Math.max(MIN_SIZE, content.width)
    const minH = Math.max(MIN_SIZE, content.height)
    const siblings = current ? (parent ? (parent.children ?? []) : current.children).filter((n) => n.id !== node.id) : []
    const targets: Rect[] = [
      { x: 0, y: 0, width: area.width, height: area.height },
      ...siblings.map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.height }))
    ]
    const parentAbs = parent && current ? absPos(current, parent.id) : null
    const guideOrigin = { x: parentAbs?.x ?? 0, y: (parentAbs?.y ?? 0) + (parent ? insetTop(parent) : 0) }

    track(
      e.pointerId,
      (ev) => {
        const grid = !ev.altKey
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        let { x, y, w, h } = o
        if (handle.includes('e')) w = snap(o.x + o.w + dx, grid) - o.x
        if (handle.includes('s')) h = snap(o.y + o.h + dy, grid) - o.y
        if (handle.includes('w')) x = snap(o.x + dx, grid)
        if (handle.includes('n')) y = snap(o.y + dy, grid)

        // Guias: a borda que está sendo arrastada gruda nas bordas dos vizinhos.
        if (grid && free) {
          const moving: Lines = { x: [], y: [] }
          if (handle.includes('e')) moving.x.push(x + w)
          if (handle.includes('w')) moving.x.push(x)
          if (handle.includes('s')) moving.y.push(y + h)
          if (handle.includes('n')) moving.y.push(y)
          const hit = snapToGuides(moving, targets)
          if (handle.includes('e')) w += hit.dx
          if (handle.includes('w')) x += hit.dx
          if (handle.includes('s')) h += hit.dy
          if (handle.includes('n')) y += hit.dy
          setGuides({ v: hit.v.map((gx) => guideOrigin.x + gx), h: hit.h.map((gy) => guideOrigin.y + gy) })
        } else setGuides(null)

        // Limites: dentro da área do pai e nunca menor que o mínimo.
        if (handle.includes('w')) {
          x = Math.max(0, Math.min(x, o.x + o.w - minW))
          w = o.x + o.w - x
        }
        if (handle.includes('n')) {
          y = Math.max(0, Math.min(y, o.y + o.h - minH))
          h = o.y + o.h - y
        }
        if (handle.includes('e')) w = Math.max(minW, free ? Math.min(w, area.width - x) : w)
        if (handle.includes('s')) h = Math.max(minH, free ? Math.min(h, area.height - y) : h)
        useIde.getState().edit((d) => setRects(d, { [node.id]: { x, y, width: w, height: h } }), txn)
      },
      () => setGuides(null)
    )
  }

  /** Arrasta a borda direita, a de baixo ou o canto do formulário para mudar o tamanho dele. */
  function onFormGripDown(e: React.PointerEvent, grip: 'e' | 's' | 'se'): void {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const frame = frameRef.current
    if (!frame) return
    const startW = doc.width
    const startH = doc.height
    const startX = e.clientX
    const startY = e.clientY
    const txn = newTxn('formsize')
    // O formulário fica centralizado na área de trabalho: ao crescer, as duas bordas se afastam do centro e
    // a borda arrastada acompanha o ponteiro com o DOBRO do deslocamento. Se ele é mais largo que a área
    // (encostado à esquerda), só a borda direita anda.
    const scroller = frame.parentElement?.parentElement ?? frame.parentElement
    const centered = scroller ? frame.getBoundingClientRect().left - scroller.getBoundingClientRect().left > 36 : true
    const factor = centered ? 2 : 1

    track(
      e.pointerId,
      (ev) => {
        const grid = !ev.altKey
        const width = grip.includes('e') ? snap(startW + factor * (ev.clientX - startX), grid) : startW
        const height = grip.includes('s') ? snap(startH + (ev.clientY - startY), grid) : startH
        useIde.getState().edit((d) => setFormProps(d, { width, height }), txn)
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
        setMarquee({ x: x1 - origin.left - surface.clientLeft, y: y1 - origin.top - surface.clientTop, w: x2 - x1, h: y2 - y1 })
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
    const surface = surfaceRef.current
    if (!type || !surface) return
    e.preventDefault()
    const hostEl = (e.target as HTMLElement).closest<HTMLElement>('[data-container="true"]')
    const parentId = hostEl?.dataset.nodeId ?? null
    const host = parentId ? locate(doc, parentId)?.node : null
    const layout = host ? layoutOf(host) : null
    const layer = layerOf(surface, parentId)

    if (parentId && layout && layout.mode !== 'absolute') {
      // Em auto-layout o item entra na ordem, na posição do ponteiro.
      const index = insertionIndex(layer, layout.mode, { x: e.clientX, y: e.clientY }, new Set())
      useIde.getState().addComponent(type, parentId, 0, 0, index)
      return
    }
    const o = originOf(layer)
    useIde.getState().addComponent(type, parentId, snap(e.clientX - o.x, true), snap(e.clientY - o.y, true))
  }

  const showRulers = useIde((st) => st.settings.rulers)
  const ticks = (length: number): number[] => Array.from({ length: Math.floor(length / 100) + 1 }, (_, i) => i * 100)

  return (
    <div className={`design-wrap${showRulers ? ' with-rulers' : ''}`}>
      {showRulers && (
        <>
          <div className="ruler ruler-h" style={{ width: doc.width }} aria-hidden="true" data-testid="ruler-h">
            {ticks(doc.width).map((n) => (
              <span key={n} style={{ left: n }}>
                {n}
              </span>
            ))}
          </div>
          <div className="ruler ruler-v" style={{ height: doc.height }} aria-hidden="true" data-testid="ruler-v">
            {ticks(doc.height).map((n) => (
              <span key={n} style={{ top: n }}>
                {n}
              </span>
            ))}
          </div>
        </>
      )}
    <div className="form-frame" ref={frameRef}>
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
        style={{ width: doc.width, height: doc.height }}
        onPointerDown={onSurfaceDown}
        onDragStart={(e) => e.preventDefault()}
        onDoubleClick={(e) => e.target === e.currentTarget && useIde.getState().openHandler(null)}
        onDragOver={onPaletteDragOver}
        onDrop={onDrop}
      >
        {doc.children.length === 0 && <span className="surface-hint">Arraste componentes da paleta para cá</span>}
        {doc.children.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            parent={null}
            selected={selected}
            showHandles={selection.length === 1}
            onNodeDown={onNodeDown}
            onHandleDown={onHandleDown}
          />
        ))}
        {guides?.v.map((x) => <div key={`v${x}`} className="guide guide-v" style={{ left: x }} />)}
        {guides?.h.map((y) => <div key={`h${y}`} className="guide guide-h" style={{ top: y }} />)}
        {marquee && (
          <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />
        )}
      </div>
      <div className="form-grip form-grip-e" data-testid="grip-e" title="Arraste para mudar a largura do formulário" onPointerDown={(e) => onFormGripDown(e, 'e')} />
      <div className="form-grip form-grip-s" data-testid="grip-s" title="Arraste para mudar a altura do formulário" onPointerDown={(e) => onFormGripDown(e, 's')} />
      <div className="form-grip form-grip-se" data-testid="grip-se" title="Arraste para mudar o tamanho do formulário" onPointerDown={(e) => onFormGripDown(e, 'se')} />
    </div>
    </div>
  )
}
