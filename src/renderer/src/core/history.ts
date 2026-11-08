// Histórico de desfazer/refazer baseado nos patches do Immer.
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer'
import type { FormDocument } from '@shared/project'

enablePatches()

export interface HistoryEntry {
  patches: Patch[]
  inverse: Patch[]
  /** Edições com o mesmo `txn` em sequência viram uma só entrada (ex.: um arraste inteiro). */
  txn?: string
}

export interface Tracked {
  doc: FormDocument
  undo: HistoryEntry[]
  redo: HistoryEntry[]
}

const LIMIT = 500

export function createTracked(doc: FormDocument): Tracked {
  return { doc, undo: [], redo: [] }
}

export function mutate(t: Tracked, recipe: (draft: FormDocument) => void, txn?: string): Tracked {
  const [doc, patches, inverse] = produceWithPatches(t.doc, recipe)
  if (patches.length === 0) return t

  const top = t.undo[t.undo.length - 1]
  if (txn !== undefined && top?.txn === txn) {
    const merged: HistoryEntry = { patches: [...top.patches, ...patches], inverse: [...inverse, ...top.inverse], txn }
    return { doc, undo: [...t.undo.slice(0, -1), merged], redo: [] }
  }
  return { doc, undo: [...t.undo.slice(-(LIMIT - 1)), { patches, inverse, txn }], redo: [] }
}

export function undo(t: Tracked): Tracked {
  const entry = t.undo[t.undo.length - 1]
  if (!entry) return t
  return { doc: applyPatches(t.doc, entry.inverse), undo: t.undo.slice(0, -1), redo: [...t.redo, entry] }
}

export function redo(t: Tracked): Tracked {
  const entry = t.redo[t.redo.length - 1]
  if (!entry) return t
  return { doc: applyPatches(t.doc, entry.patches), undo: [...t.undo, entry], redo: t.redo.slice(0, -1) }
}
