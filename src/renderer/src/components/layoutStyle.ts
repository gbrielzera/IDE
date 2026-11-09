import type { CSSProperties } from 'react'
import type { FormNode } from '@shared/project'
import { insetTop } from '../core/tree'
import { layoutOf, type LayoutInfo } from '../core/props'

const ALIGN: Record<string, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch'
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Posição e tamanho de um filho: absolutos por padrão; num container com auto-layout é o pai
 * quem posiciona (x/y não valem) e o alinhamento "stretch" estica o eixo transversal.
 */
export function childBoxStyle(box: Box, parentLayout: LayoutInfo | null): CSSProperties {
  if (parentLayout && parentLayout.mode !== 'absolute') {
    const stretch = parentLayout.align === 'stretch'
    return {
      position: 'relative',
      flex: 'none',
      width: stretch && parentLayout.mode === 'vertical' ? undefined : box.width,
      height: stretch && parentLayout.mode === 'horizontal' ? undefined : box.height
    }
  }
  return { left: box.x, top: box.y, width: box.width, height: box.height }
}

/** Estilo da camada que contém os filhos de um container (abaixo do cabeçalho, com flex se auto-layout). */
export function childrenLayerStyle(node: FormNode): CSSProperties {
  const own = layoutOf(node)
  const style: CSSProperties = { top: insetTop(node) }
  if (own.mode !== 'absolute') {
    Object.assign(style, {
      display: 'flex',
      flexDirection: own.mode === 'vertical' ? 'column' : 'row',
      gap: own.gap,
      padding: own.padding,
      alignItems: ALIGN[own.align]
    })
  }
  return style
}
