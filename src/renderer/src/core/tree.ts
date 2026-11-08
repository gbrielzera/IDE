import type { FormNode } from '@shared/project'

export interface HasChildren {
  children: FormNode[]
}

export interface Located {
  node: FormNode
  list: FormNode[]
  parent: FormNode | null
  index: number
}

export function locate(root: HasChildren, id: string): Located | null {
  function search(list: FormNode[], parent: FormNode | null): Located | null {
    for (let i = 0; i < list.length; i++) {
      const node = list[i]
      if (node.id === id) return { node, list, parent, index: i }
      if (node.children) {
        const found = search(node.children, node)
        if (found) return found
      }
    }
    return null
  }
  return search(root.children, null)
}

export function walk(root: HasChildren, fn: (node: FormNode, depth: number) => void): void {
  function visit(list: FormNode[], depth: number): void {
    for (const node of list) {
      fn(node, depth)
      if (node.children) visit(node.children, depth + 1)
    }
  }
  visit(root.children, 0)
}

export function allIds(root: HasChildren): Set<string> {
  const ids = new Set<string>()
  walk(root, (n) => ids.add(n.id))
  return ids
}

/** Posição do nó em relação ao formulário (soma as posições dos ancestrais). */
export function absPos(root: HasChildren, id: string): { x: number; y: number } | null {
  function search(list: FormNode[], ox: number, oy: number): { x: number; y: number } | null {
    for (const node of list) {
      if (node.id === id) return { x: ox + node.x, y: oy + node.y }
      if (node.children) {
        const found = search(node.children, ox + node.x, oy + node.y)
        if (found) return found
      }
    }
    return null
  }
  return search(root.children, 0, 0)
}

/** `id` está dentro da subárvore de `ancestorId` (estritamente, sem contar o próprio)? */
export function isInside(root: HasChildren, ancestorId: string, id: string): boolean {
  const ancestor = locate(root, ancestorId)
  if (!ancestor?.node.children) return false
  return locate({ children: ancestor.node.children }, id) !== null
}

/** Mantém só os nós existentes que não têm um ancestral também na lista. */
export function topmost(root: HasChildren, ids: readonly string[]): string[] {
  const existing = ids.filter((id) => locate(root, id) !== null)
  return existing.filter((id) => !existing.some((other) => other !== id && isInside(root, other, id)))
}
