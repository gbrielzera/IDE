import type { FormDocument } from '@shared/project'
import type { RunComponent } from '@shared/run'
import { allPropDefs, CATALOG_BY_TYPE } from '../components/catalog'
import { walk } from './tree'

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/**
 * O que o Python e a janela de execução recebem de cada componente: tipo e TODAS as propriedades,
 * com os padrões do schema preenchidos (o arquivo só grava o que difere do padrão) e a geometria.
 */
export function buildRunComponents(doc: FormDocument): Record<string, RunComponent> {
  const out: Record<string, RunComponent> = {}
  walk(doc, (n) => {
    const { own, common } = allPropDefs(n.type)
    const props: Record<string, unknown> = { x: n.x, y: n.y, width: n.width, height: n.height }
    for (const def of [...own, ...common]) props[def.key] = clone(def.default)
    Object.assign(props, clone(CATALOG_BY_TYPE[n.type]?.runtimeProps ?? {}), clone(n.props))
    out[n.id] = { type: n.type, props }
  })
  return out
}
