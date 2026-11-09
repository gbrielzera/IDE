// Limites de posição e tamanho: um componente nunca sai da área do pai (formulário ou container).
import type { FormDocument, FormNode } from '@shared/project'
import type { Rect } from './commands'
import { isAutoLayout } from './props'
import { insetTop, locate } from './tree'

export interface Size {
  width: number
  height: number
}

/** Área disponível para os filhos de um container (ou do formulário, com `parentId` nulo). */
export function contentSize(doc: FormDocument, parentId: string | null): Size {
  if (!parentId) return { width: doc.width, height: doc.height }
  const parent = locate(doc, parentId)?.node
  if (!parent) return { width: doc.width, height: doc.height }
  return { width: parent.width, height: Math.max(0, parent.height - insetTop(parent)) }
}

/** Mantém o retângulo dentro da área: encolhe se for maior que ela e empurra para dentro se passar da borda. */
export function clampRect(rect: Rect, size: Size): Rect {
  const width = Math.min(rect.width, size.width)
  const height = Math.min(rect.height, size.height)
  return {
    x: Math.min(Math.max(0, rect.x), Math.max(0, size.width - width)),
    y: Math.min(Math.max(0, rect.y), Math.max(0, size.height - height)),
    width,
    height
  }
}

/**
 * Menor tamanho que ainda contém os filhos posicionados à mão (num container com auto-layout, o pai
 * posiciona sozinho e não há mínimo). Impede encolher um formulário/painel de modo a deixar componentes de fora.
 */
export function minContentSize(children: readonly FormNode[], parent: FormNode | null): Size {
  if (parent && isAutoLayout(parent)) return { width: 0, height: 0 }
  let width = 0
  let height = 0
  for (const child of children) {
    width = Math.max(width, child.x + child.width)
    height = Math.max(height, child.y + child.height)
  }
  return { width, height: height + (parent ? insetTop(parent) : 0) }
}
