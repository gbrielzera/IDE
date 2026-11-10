// Migrações de formulários entre versões do esquema. Cada passo converte da versão N para a N+1 e é explícito:
// nunca mudamos em silêncio o significado de uma propriedade antiga.
import { FORM_SCHEMA_VERSION } from '@shared/project'
import { newUid } from '@shared/uid'

export type Step = (doc: Record<string, unknown>) => Record<string, unknown>

/** Versão 1 → 2: cada componente ganha um `uid` (identidade interna estável). Nada mais muda. */
function addUids(doc: Record<string, unknown>): Record<string, unknown> {
  const visit = (list: unknown): unknown =>
    Array.isArray(list)
      ? list.map((n) => {
          if (typeof n !== 'object' || n === null) return n
          const node = n as Record<string, unknown>
          const { uid: _old, ...rest } = node
          return { uid: newUid(), ...rest, ...(node.children !== undefined ? { children: visit(node.children) } : {}) }
        })
      : list
  return { ...doc, children: visit(doc.children) }
}

/** `STEPS[n]` converte um formulário da versão n para a n+1. */
export const STEPS: Record<number, Step> = { 1: addUids }

export interface MigrationResult {
  doc: Record<string, unknown>
  from: number
  to: number
  /** Passos aplicados (vazio = já estava na versão atual). */
  applied: number[]
}

export function migrateForm(raw: Record<string, unknown>, target = FORM_SCHEMA_VERSION, steps: Record<number, Step> = STEPS): MigrationResult {
  const from = typeof raw.version === 'number' && Number.isInteger(raw.version) ? raw.version : 1
  if (from > target) throw new Error(`Formulário na versão ${from}; esta IDE lê até a versão ${target}.`)
  let doc = raw
  const applied: number[] = []
  for (let v = from; v < target; v++) {
    const step = steps[v]
    if (!step) throw new Error(`Não há migração da versão ${v} para a ${v + 1}.`)
    doc = { ...step(structuredClone(doc)), version: v + 1 }
    applied.push(v)
  }
  return { doc, from, to: target, applied }
}
