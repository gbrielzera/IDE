// Comandos de edição: funções que alteram um rascunho (draft) do formulário.
// Toda mutação passa por aqui; o histórico (history.ts) transforma cada uma em desfazer/refazer.
import type { FormDocument, FormNode } from '@shared/project'
import { CATALOG_BY_TYPE } from '../components/catalog'
import { uniqueId } from './ids'
import { absPos, allIds, isInside, locate, topmost } from './tree'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const MIN_SIZE = 8
export const DUPLICATE_OFFSET = 16

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Cria um nó novo com tamanho e propriedades padrão do tipo e um ID livre. */
export function createNode(doc: FormDocument, type: string, x: number, y: number): FormNode | null {
  const def = CATALOG_BY_TYPE[type]
  if (!def) return null
  const node: FormNode = {
    id: uniqueId(type, allIds(doc)),
    type,
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: def.width,
    height: def.height,
    props: clone(def.props)
  }
  if (def.container) node.children = []
  return node
}

function isContainer(node: FormNode): boolean {
  return CATALOG_BY_TYPE[node.type]?.container === true
}

/** Adiciona o nó no container indicado; se ele não existir ou não for container, vai para o formulário. */
export function addNode(doc: FormDocument, parentId: string | null, node: FormNode): void {
  const parent = parentId ? locate(doc, parentId)?.node : undefined
  if (parent && isContainer(parent)) {
    parent.children ??= []
    parent.children.push(node)
  } else {
    doc.children.push(node)
  }
}

export function setRects(doc: FormDocument, rects: Record<string, Partial<Rect>>): void {
  for (const [id, r] of Object.entries(rects)) {
    const node = locate(doc, id)?.node
    if (!node) continue
    if (r.x !== undefined) node.x = r.x
    if (r.y !== undefined) node.y = r.y
    if (r.width !== undefined) node.width = Math.max(MIN_SIZE, r.width)
    if (r.height !== undefined) node.height = Math.max(MIN_SIZE, r.height)
  }
}

export function setProp(doc: FormDocument, id: string, key: string, value: unknown): void {
  const node = locate(doc, id)?.node
  if (node) node.props[key] = value
}

export function deleteNodes(doc: FormDocument, ids: readonly string[]): void {
  for (const id of topmost(doc, ids)) {
    const loc = locate(doc, id)
    if (loc) loc.list.splice(loc.index, 1)
  }
}

function renameTree(node: FormNode, taken: Set<string>): void {
  node.id = uniqueId(node.type, taken)
  taken.add(node.id)
  node.children?.forEach((c) => renameTree(c, taken))
}

/** Duplica (com IDs novos), deslocando a cópia. Devolve os IDs das cópias. */
export function duplicateNodes(doc: FormDocument, ids: readonly string[]): string[] {
  const taken = allIds(doc)
  const created: string[] = []
  for (const id of topmost(doc, ids)) {
    const loc = locate(doc, id)
    if (!loc) continue
    const copy = clone(loc.node)
    renameTree(copy, taken)
    copy.x += DUPLICATE_OFFSET
    copy.y += DUPLICATE_OFFSET
    loc.list.splice(loc.index + 1, 0, copy)
    created.push(copy.id)
  }
  return created
}

/**
 * Move os nós para outro container (ou para o formulário, com `newParentId` nulo),
 * mantendo a posição visual e limitando ao interior do novo pai.
 */
export function reparentNodes(doc: FormDocument, ids: readonly string[], newParentId: string | null): void {
  const newParent = newParentId ? (locate(doc, newParentId)?.node ?? null) : null
  if (newParentId && (!newParent || !isContainer(newParent))) return
  const parentAbs = newParentId ? absPos(doc, newParentId) : { x: 0, y: 0 }
  if (!parentAbs) return
  const bounds = newParent ?? doc

  for (const id of topmost(doc, ids)) {
    const loc = locate(doc, id)
    if (!loc) continue
    if (id === newParentId || isInside(doc, id, newParentId ?? '')) continue
    if ((loc.parent?.id ?? null) === newParentId) continue

    const abs = absPos(doc, id)
    if (!abs) continue
    const node = loc.node
    node.x = Math.min(Math.max(0, abs.x - parentAbs.x), Math.max(0, bounds.width - node.width))
    node.y = Math.min(Math.max(0, abs.y - parentAbs.y), Math.max(0, bounds.height - node.height))
    loc.list.splice(loc.index, 1)
    if (newParent) (newParent.children ??= []).push(node)
    else doc.children.push(node)
  }
}
