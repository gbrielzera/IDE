// Migrações de formulários entre versões do esquema. Cada passo converte da versão N para a N+1 e é explícito:
// nunca mudamos em silêncio o significado de uma propriedade antiga.
import { SCHEMA_VERSION } from '@shared/project'

export type Step = (doc: Record<string, unknown>) => Record<string, unknown>

/** `STEPS[n]` converte um formulário da versão n para a n+1. (Ainda não há nenhum: a versão atual é a 1.) */
export const STEPS: Record<number, Step> = {}

export interface MigrationResult {
  doc: Record<string, unknown>
  from: number
  to: number
  /** Passos aplicados (vazio = já estava na versão atual). */
  applied: number[]
}

export function migrateForm(raw: Record<string, unknown>, target = SCHEMA_VERSION, steps: Record<number, Step> = STEPS): MigrationResult {
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
