// Catálogo de componentes (dados puros, sem React). Vem do Component Registry (registry/components.json):
// para criar ou mudar um componente, edite o registro, não este arquivo.
import { REGISTRY, type ComponentSpec, type PropSpec } from '@shared/registry'

export type { PropType } from '@shared/registry'
export type PropDef = PropSpec

/**
 * Propriedades comuns de aparência/estado. Só são gravadas no arquivo quando diferem do padrão,
 * para o JSON do formulário continuar enxuto.
 */
export const COMMON_PROPS: Record<string, PropDef> = REGISTRY.commonProps

export interface ComponentDef extends Omit<ComponentSpec, 'props'> {
  /** Propriedades específicas; os padrões são gravados ao criar o componente. */
  schema: PropDef[]
}

export const TABS_HEADER_HEIGHT = 24

export const CATALOG: ComponentDef[] = REGISTRY.components.map(({ props, ...rest }) => ({ ...rest, schema: props }))

export const CATALOG_BY_TYPE: Record<string, ComponentDef> = Object.fromEntries(CATALOG.map((c) => [c.type, c]))

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** Propriedades gravadas num componente recém-criado (cópias independentes). */
export function defaultProps(type: string): Record<string, unknown> {
  const def = CATALOG_BY_TYPE[type]
  return Object.fromEntries((def?.schema ?? []).map((p) => [p.key, clone(p.default)]))
}

/** Definição de uma propriedade (específica ou comum) de um tipo de componente. */
export function propDef(type: string, key: string): PropDef | undefined {
  const def = CATALOG_BY_TYPE[type]
  if (!def) return undefined
  return def.schema.find((p) => p.key === key) ?? (def.common.includes(key) ? COMMON_PROPS[key] : undefined)
}

/** Todas as propriedades editáveis de um tipo: primeiro as específicas, depois as comuns. */
export function allPropDefs(type: string): { own: PropDef[]; common: PropDef[] } {
  const def = CATALOG_BY_TYPE[type]
  return { own: def?.schema ?? [], common: (def?.common ?? []).map((k) => COMMON_PROPS[k]) }
}
