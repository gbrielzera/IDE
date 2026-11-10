// Refatorações no texto do script Python: renomear um ID de componente em todas as referências.
import { maskLine } from './lint'

export interface RenameResult {
  script: string
  /** Quantas referências foram atualizadas. */
  count: number
}

interface Edit {
  start: number
  end: number
  text: string
}

/**
 * Troca `form.<antigo>` por `form.<novo>` e `form["<antigo>"]` por `form["<novo>"]`, só no CÓDIGO: o que está
 * em comentários e em textos comuns não é tocado (mas as chaves de uma f-string são código e são atualizadas).
 * IDs parecidos não se confundem: renomear `btn` não mexe em `btnOk`.
 */
export function renameInScript(script: string, oldId: string, newId: string): RenameResult {
  if (oldId === newId || oldId === '') return { script, count: 0 }
  let count = 0
  const lines = script.split('\n').map((line) => {
    const masked = maskLine(line)
    const edits: Edit[] = []

    for (const m of masked.matchAll(/(?<![\p{L}\p{N}_.])form\.([\p{L}\p{N}_]+)/gu)) {
      if (m[1] !== oldId) continue
      const start = m.index + 'form.'.length
      edits.push({ start, end: start + oldId.length, text: newId })
    }
    for (const m of line.matchAll(/(?<![\p{L}\p{N}_.])form\[\s*(["'])([\p{L}\p{N}_]+)\1\s*\]/gu)) {
      if (m[2] !== oldId || !masked.startsWith('form[', m.index)) continue // o `form[` precisa estar em código
      const start = m.index + m[0].indexOf(m[1]) + 1
      edits.push({ start, end: start + oldId.length, text: newId })
    }

    let result = line
    for (const e of edits.sort((a, b) => b.start - a.start)) {
      result = result.slice(0, e.start) + e.text + result.slice(e.end)
      count++
    }
    return result
  })
  return { script: lines.join('\n'), count }
}
