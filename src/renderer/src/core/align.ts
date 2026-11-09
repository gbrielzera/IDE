// Alinhar e distribuir componentes (como no Figma), sempre entre irmãos de um container sem auto-layout.
import type { FormDocument, FormNode } from '@shared/project'
import { contentSize } from './bounds'
import { isAutoLayout } from './props'
import { locate, topmost } from './tree'

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom'
export type Axis = 'h' | 'v'

/** Os nós selecionados (sem descendentes de outros selecionados), se todos forem irmãos num pai posicionado à mão. */
function siblingsOf(doc: FormDocument, ids: readonly string[]): { nodes: FormNode[]; parentId: string | null } | null {
  const roots = topmost(doc, ids)
  const found = roots.map((id) => locate(doc, id)).filter((l): l is NonNullable<typeof l> => l !== null)
  if (found.length === 0) return null
  const parent = found[0].parent
  if (found.some((l) => (l.parent?.id ?? null) !== (parent?.id ?? null))) return null
  if (parent && isAutoLayout(parent)) return null
  return { nodes: found.map((l) => l.node), parentId: parent?.id ?? null }
}

/** Dá para alinhar? (1 componente alinha ao pai; 2 ou mais, entre si.) */
export function canAlign(doc: FormDocument, ids: readonly string[]): boolean {
  return siblingsOf(doc, ids) !== null
}

/** Dá para distribuir? (precisa de 3 ou mais irmãos.) */
export function canDistribute(doc: FormDocument, ids: readonly string[]): boolean {
  const s = siblingsOf(doc, ids)
  return s !== null && s.nodes.length >= 3
}

export function alignNodes(doc: FormDocument, ids: readonly string[], mode: AlignMode): void {
  const s = siblingsOf(doc, ids)
  if (!s) return
  // Com vários, alinha pela caixa que envolve todos; sozinho, pela área do pai.
  const area = contentSize(doc, s.parentId)
  const box =
    s.nodes.length > 1
      ? {
          left: Math.min(...s.nodes.map((n) => n.x)),
          top: Math.min(...s.nodes.map((n) => n.y)),
          right: Math.max(...s.nodes.map((n) => n.x + n.width)),
          bottom: Math.max(...s.nodes.map((n) => n.y + n.height))
        }
      : { left: 0, top: 0, right: area.width, bottom: area.height }

  for (const n of s.nodes) {
    if (mode === 'left') n.x = box.left
    else if (mode === 'right') n.x = box.right - n.width
    else if (mode === 'hcenter') n.x = Math.round((box.left + box.right - n.width) / 2)
    else if (mode === 'top') n.y = box.top
    else if (mode === 'bottom') n.y = box.bottom - n.height
    else n.y = Math.round((box.top + box.bottom - n.height) / 2)
    n.x = Math.max(0, n.x)
    n.y = Math.max(0, n.y)
  }
}

/** Espaços iguais entre os componentes; o primeiro e o último (em cada eixo) ficam onde estão. */
export function distributeNodes(doc: FormDocument, ids: readonly string[], axis: Axis): void {
  const s = siblingsOf(doc, ids)
  if (!s || s.nodes.length < 3) return
  const pos = (n: FormNode): number => (axis === 'h' ? n.x : n.y)
  const len = (n: FormNode): number => (axis === 'h' ? n.width : n.height)
  const sorted = [...s.nodes].sort((a, b) => pos(a) - pos(b))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const span = pos(last) + len(last) - pos(first)
  const gap = (span - sorted.reduce((sum, n) => sum + len(n), 0)) / (sorted.length - 1)

  let cursor = pos(first) + len(first)
  for (const n of sorted.slice(1, -1)) {
    const at = Math.round(cursor + gap)
    if (axis === 'h') n.x = at
    else n.y = at
    cursor = at + len(n)
  }
}
