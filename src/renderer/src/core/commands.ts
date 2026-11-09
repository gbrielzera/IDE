// Comandos de edição: funções que alteram um rascunho (draft) do formulário.
// Toda mutação passa por aqui; o histórico (history.ts) transforma cada uma em desfazer/refazer.
import type { FormDocument, FormNode } from '@shared/project'
import { CATALOG_BY_TYPE, COMMON_PROPS, defaultProps, propDef } from '../components/catalog'
import { clampRect, contentSize, minContentSize } from './bounds'
import { idProblem, uniqueId } from './ids'
import { activeTab } from './props'
import { absPos, allIds, insetTop, isInside, locate, topmost } from './tree'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const MIN_SIZE = 8
export const FORM_MAX_SIZE = 4000
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
    props: defaultProps(type)
  }
  if (def.container) node.children = []
  return node
}

function isContainer(node: FormNode): boolean {
  return CATALOG_BY_TYPE[node.type]?.container === true
}

/** Um filho de Tabs pertence a uma aba; em qualquer outro pai, não. */
function assignTab(parent: FormNode | null, node: FormNode): void {
  if (parent?.type === 'Tabs') node.tab = activeTab(parent)
  else delete node.tab
}

function insertAt(list: FormNode[], node: FormNode, index?: number): void {
  if (index === undefined) list.push(node)
  else list.splice(Math.max(0, Math.min(index, list.length)), 0, node)
}

/**
 * Adiciona o nó no container indicado (na posição `index`, se dada);
 * se o pai não existir ou não for container, vai para o formulário.
 */
export function addNode(doc: FormDocument, parentId: string | null, node: FormNode, index?: number): void {
  const parent = parentId ? locate(doc, parentId)?.node : undefined
  if (parent && isContainer(parent)) {
    parent.children ??= []
    assignTab(parent, node)
    insertAt(parent.children, node, index)
  } else {
    delete node.tab
    insertAt(doc.children, node, index)
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

/** Altera uma propriedade. As comuns que voltam ao padrão são removidas do arquivo. */
export function setProp(doc: FormDocument, id: string, key: string, value: unknown): void {
  const node = locate(doc, id)?.node
  if (!node) return
  if (key in COMMON_PROPS && value === propDef(node.type, key)?.default) delete node.props[key]
  else node.props[key] = value
}

/** Troca o ID de um componente. Ignora IDs inválidos ou já em uso (a validação amigável fica na store). */
export function renameNode(doc: FormDocument, id: string, newId: string): void {
  if (id === newId || idProblem(newId) !== null || allIds(doc).has(newId)) return
  const node = locate(doc, id)?.node
  if (node) node.id = newId
}

export function setFormProps(doc: FormDocument, props: Partial<Pick<FormDocument, 'title' | 'width' | 'height'>>): void {
  if (props.title !== undefined) doc.title = props.title
  // O formulário nunca fica menor que o necessário para conter os componentes (nada fica de fora).
  const min = minContentSize(doc.children, null)
  if (props.width !== undefined) doc.width = Math.min(FORM_MAX_SIZE, Math.max(100, min.width, Math.round(props.width)))
  if (props.height !== undefined) doc.height = Math.min(FORM_MAX_SIZE, Math.max(100, min.height, Math.round(props.height)))
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
 * Cola cópias de componentes (com IDs novos) dentro do container indicado (ou do formulário), deslocadas e
 * mantidas dentro da área. Funciona entre formulários: os IDs são gerados para o formulário de destino.
 */
export function pasteNodes(doc: FormDocument, parentId: string | null, nodes: readonly FormNode[], offset = DUPLICATE_OFFSET): string[] {
  const host = parentId ? locate(doc, parentId)?.node : undefined
  const target = host && isContainer(host) ? host : null
  const size = contentSize(doc, target?.id ?? null)
  const taken = allIds(doc)
  const created: string[] = []
  for (const source of nodes) {
    const copy = clone(source)
    renameTree(copy, taken)
    const at = clampRect({ x: copy.x + offset, y: copy.y + offset, width: copy.width, height: copy.height }, size)
    copy.x = at.x
    copy.y = at.y
    addNode(doc, target?.id ?? null, copy)
    created.push(copy.id)
  }
  return created
}

/**
 * Move um nó para a posição `index` da lista de filhos de `parentId` (ou do formulário, se nulo).
 * Serve para reordenar dentro de um container com auto-layout e para soltar dentro dele.
 */
export function moveToIndex(doc: FormDocument, id: string, parentId: string | null, index: number): void {
  const loc = locate(doc, id)
  if (!loc) return
  const target = parentId ? (locate(doc, parentId)?.node ?? null) : null
  if (parentId && (!target || !isContainer(target) || id === parentId || isInside(doc, id, parentId))) return
  const list = target ? (target.children ??= []) : doc.children

  if (list === loc.list) {
    const clamped = Math.max(0, Math.min(index, list.length - 1))
    if (clamped === loc.index) return // já está lá: não gera patches à toa
    list.splice(loc.index, 1)
    list.splice(clamped, 0, loc.node)
    return
  }
  loc.list.splice(loc.index, 1)
  insertAt(list, loc.node, index)
  assignTab(target, loc.node)
}

/**
 * Move os nós para outro container (ou para o formulário, com `newParentId` nulo), limitando ao
 * interior do novo pai. Por padrão mantém a posição visual; `positions` (relativas ao novo pai)
 * substitui isso para quem vem de um container com auto-layout, onde x/y do modelo não valem.
 */
export function reparentNodes(
  doc: FormDocument,
  ids: readonly string[],
  newParentId: string | null,
  positions?: Record<string, { x: number; y: number }>
): void {
  const newParent = newParentId ? (locate(doc, newParentId)?.node ?? null) : null
  if (newParentId && (!newParent || !isContainer(newParent))) return
  const parentAbs = newParentId ? absPos(doc, newParentId) : { x: 0, y: 0 }
  if (!parentAbs) return
  const originX = parentAbs.x
  const originY = parentAbs.y + (newParent ? insetTop(newParent) : 0)
  const boundsW = newParent?.width ?? doc.width
  const boundsH = (newParent?.height ?? doc.height) - (newParent ? insetTop(newParent) : 0)

  for (const id of topmost(doc, ids)) {
    const loc = locate(doc, id)
    if (!loc) continue
    if (id === newParentId || isInside(doc, id, newParentId ?? '')) continue
    if ((loc.parent?.id ?? null) === newParentId) continue

    const abs = absPos(doc, id)
    if (!abs) continue
    const node = loc.node
    const x = positions?.[id]?.x ?? abs.x - originX
    const y = positions?.[id]?.y ?? abs.y - originY
    node.x = Math.min(Math.max(0, x), Math.max(0, boundsW - node.width))
    node.y = Math.min(Math.max(0, y), Math.max(0, boundsH - node.height))
    loc.list.splice(loc.index, 1)
    assignTab(newParent, node)
    if (newParent) (newParent.children ??= []).push(node)
    else doc.children.push(node)
  }
}
