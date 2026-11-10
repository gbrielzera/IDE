import { CATALOG_BY_TYPE } from '../components/catalog'

/** Propriedade com o texto visível do componente (o "rótulo"), ou null se ele não tem. */
export function textKeyOf(type: string): string | null {
  return CATALOG_BY_TYPE[type]?.schema.some((p) => p.key === 'text' && p.type !== 'enum') ? 'text' : null
}
