import { useMemo } from 'react'
import { CATALOG_BY_TYPE } from '../components/catalog'
import { appearanceStyle, renderContent } from '../components/render'
import { createNode } from '../core/commands'

/** Desenho do componente como ele aparece no formulário (cores do formulário, não da IDE). */
export function ComponentPreview({ type }: { type: string }): React.JSX.Element | null {
  const node = useMemo(() => createNode({ children: [] } as never, type, 0, 0), [type])
  if (!node || !CATALOG_BY_TYPE[type]) return null
  return (
    <div className="form-surface preview-surface" style={{ width: node.width, height: node.height }}>
      <div style={{ position: 'relative', width: node.width, height: node.height, ...appearanceStyle(node) }}>
        {renderContent(node)}
      </div>
    </div>
  )
}
