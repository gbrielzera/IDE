// Validação de um formulário já lido: tipos de componente, propriedades, limites e tamanhos.
import type { FormDocument, FormNode } from '@shared/project'
import type { Issue } from '@shared/manifest'
import { CATALOG_BY_TYPE, propDef, type PropDef } from '../components/catalog'

export const MAX_NODES = 5000
export const MAX_DEPTH = 32
export const MAX_DIMENSION = 20_000

function checkProp(node: FormNode, def: PropDef, value: unknown, out: (message: string, prop: string) => void): void {
  const bad = (what: string): void => out(`${what} (esperado ${def.type})`, def.key)
  switch (def.type) {
    case 'string':
    case 'text':
    case 'color':
      if (typeof value !== 'string') bad(`valor ${JSON.stringify(value)} não é texto`)
      return
    case 'boolean':
      if (typeof value !== 'boolean') bad(`valor ${JSON.stringify(value)} não é sim/não`)
      return
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return bad(`valor ${JSON.stringify(value)} não é número`)
      if (def.min !== undefined && value < def.min) out(`valor ${value} abaixo do mínimo ${def.min}`, def.key)
      if (def.max !== undefined && value > def.max) out(`valor ${value} acima do máximo ${def.max}`, def.key)
      return
    case 'enum':
      if (typeof value !== 'string' || (def.options && !def.options.includes(value))) out(`valor ${JSON.stringify(value)} fora das opções (${def.options?.join(', ')})`, def.key)
      return
    case 'items':
      if (!Array.isArray(value)) bad('valor não é uma lista')
      return
  }
}

/** Problemas de um formulário. `error` impede a execução; `warning` só é mostrado. */
export function validateForm(doc: FormDocument, file?: string): Issue[] {
  const issues: Issue[] = []
  const add = (severity: Issue['severity'], message: string, component?: string, prop?: string): void =>
    void issues.push({ severity, file, form: doc.name, component, prop, message })

  for (const [k, v] of [['largura', doc.width], ['altura', doc.height]] as const)
    if (!Number.isFinite(v) || v < 1 || v > MAX_DIMENSION) add('error', `${k} do formulário inválida (${String(v)}).`)

  let count = 0
  const visit = (nodes: FormNode[], depth: number, parent: FormNode | null): void => {
    if (depth > MAX_DEPTH) return add('error', `Aninhamento profundo demais (mais de ${MAX_DEPTH} níveis).`, parent?.id)
    for (const n of nodes) {
      if (++count > MAX_NODES) return
      const def = CATALOG_BY_TYPE[n.type]
      if (!def) {
        add('error', `tipo de componente desconhecido: "${n.type}".`, n.id)
        continue
      }
      for (const [k, v] of [['x', n.x], ['y', n.y], ['width', n.width], ['height', n.height]] as const)
        if (!Number.isFinite(v) || Math.abs(v) > MAX_DIMENSION) add('error', `${k} fora do limite (${String(v)}).`, n.id, k)
      if (n.width < 1 || n.height < 1) add('error', 'tamanho deve ser pelo menos 1.', n.id)
      for (const [key, value] of Object.entries(n.props)) {
        const pd = propDef(n.type, key)
        if (!pd) add('warning', 'propriedade desconhecida (será ignorada).', n.id, key)
        else checkProp(n, pd, value, (message, prop) => add('error', message, n.id, prop))
      }
      if (n.tab !== undefined && parent?.type === 'Tabs') {
        const tabs = parent.props.tabs
        if (Array.isArray(tabs) && (n.tab < 0 || n.tab >= tabs.length)) add('warning', `aba ${n.tab + 1} não existe no Tabs "${parent.id}".`, n.id)
      }
      if (n.children) {
        if (!def.container) add('warning', 'este tipo não aceita componentes dentro; os filhos serão ignorados.', n.id)
        visit(n.children, depth + 1, n)
      }
    }
  }
  visit(doc.children, 1, null)
  if (count > MAX_NODES) add('error', `Componentes demais (mais de ${MAX_NODES}).`)
  return issues
}
