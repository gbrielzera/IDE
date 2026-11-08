import type { FormNode } from '@shared/project'
import { propDef } from '../components/catalog'

/** Valor da propriedade, caindo no padrão do schema quando o arquivo não a grava. */
export function getProp<T = unknown>(node: FormNode, key: string): T {
  return (key in node.props ? node.props[key] : propDef(node.type, key)?.default) as T
}

export type LayoutMode = 'absolute' | 'vertical' | 'horizontal'
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch'

export interface LayoutInfo {
  mode: LayoutMode
  gap: number
  padding: number
  align: LayoutAlign
}

/** Como um container posiciona os filhos. Só o Panel tem auto-layout. */
export function layoutOf(node: FormNode): LayoutInfo {
  if (node.type !== 'Panel') return { mode: 'absolute', gap: 0, padding: 0, align: 'start' }
  const mode = getProp<string>(node, 'layout')
  return {
    mode: mode === 'vertical' || mode === 'horizontal' ? mode : 'absolute',
    gap: getProp<number>(node, 'gap'),
    padding: getProp<number>(node, 'padding'),
    align: getProp<LayoutAlign>(node, 'align')
  }
}

export function isAutoLayout(node: FormNode | null | undefined): node is FormNode {
  return !!node && layoutOf(node).mode !== 'absolute'
}

/** Aba atualmente selecionada de um Tabs, limitada ao número de abas. */
export function activeTab(node: FormNode): number {
  const count = Math.max(1, (getProp<unknown[]>(node, 'tabs') ?? []).length)
  const sel = getProp<number>(node, 'selectedIndex')
  return Math.min(Math.max(0, Number.isFinite(sel) ? sel : 0), count - 1)
}
