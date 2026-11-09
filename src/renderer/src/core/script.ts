// Edições no texto do script Python: criar/encontrar o handler de um evento (duplo clique no componente).
import { defaultEvent } from './pyapi'

export interface HandlerResult {
  script: string
  /** Linha (base 1) onde o cursor deve ficar: o corpo do handler. */
  line: number
  /** Verdadeiro se o handler foi criado agora; falso se já existia. */
  created: boolean
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Linha (base 0) do corpo da função que começa depois do decorador na linha `from`; ou a própria `from`. */
function bodyLineAfter(lines: string[], from: number): number {
  let i = from
  while (i < lines.length && !/^\s*(async\s+)?def\s/.test(lines[i])) {
    if (!/^\s*(@|#|$)/.test(lines[i]) && i > from) return from // não é uma função: fica no decorador
    i++
  }
  if (i >= lines.length) return from
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() === '' || /^\s*#/.test(lines[j])) continue
    return /^\s+/.test(lines[j]) ? j : i
  }
  return i
}

/** Linha (base 0) onde o handler de `id`/`event` já está registrado, ou -1. */
function findHandler(lines: string[], id: string | null, event: string): number {
  const patterns =
    id === null
      ? [/^\s*@form\.on_load\b/, /^\s*form\.on_load\s*\(/]
      : [
          new RegExp(`^\\s*@form\\.${escapeRe(id)}\\.on_${event}\\b`),
          new RegExp(`^\\s*@form\\.${escapeRe(id)}\\.on\\(\\s*["']${event}["']`),
          new RegExp(`^\\s*form\\.${escapeRe(id)}\\.on_${event}\\s*\\(`),
          new RegExp(`^\\s*form\\.${escapeRe(id)}\\.on\\(\\s*["']${event}["']`),
          new RegExp(`^\\s*@form\\[["']${escapeRe(id)}["']\\]\\.on_${event}\\b`)
        ]
  return lines.findIndex((l) => patterns.some((p) => p.test(l)))
}

function uniqueFunctionName(script: string, base: string): string {
  let name = base
  for (let n = 2; new RegExp(`^\\s*(async\\s+)?def\\s+${escapeRe(name)}\\s*\\(`, 'm').test(script); n++) name = `${base}_${n}`
  return name
}

/**
 * Garante que existe um handler para o evento do componente (ou `@form.on_load`, com `id` nulo).
 * Se existir, só devolve onde ele está; se não, acrescenta um esqueleto no fim do script.
 */
export function ensureHandler(script: string, id: string | null, event = 'click'): HandlerResult {
  const lines = script.split('\n')
  const found = findHandler(lines, id, id === null ? 'load' : event)
  if (found >= 0) {
    // Com decorador, o cursor vai para o corpo da função; um registro `form.x.on("click", fn)` fica na própria linha.
    const decorated = /^\s*@/.test(lines[found])
    return { script, line: (decorated ? bodyLineAfter(lines, found) : found) + 1, created: false }
  }

  const decorator = id === null ? '@form.on_load' : `@form.${id}.on_${event}`
  const fname = uniqueFunctionName(script, id === null ? 'ao_carregar' : `${id}_${event}`)
  const params = id !== null && event !== 'click' ? 'ev' : ''
  const stub = [decorator, `def ${fname}(${params}):`, '    pass', '']

  const trimmed = script.replace(/\s+$/, '')
  const prefix = trimmed === '' ? '' : `${trimmed}\n\n\n`
  const next = prefix + stub.join('\n')
  const line = (prefix === '' ? 0 : prefix.split('\n').length - 1) + 3 // a linha do `pass`
  return { script: next, line, created: true }
}

/** Evento criado pelo duplo clique em um componente do tipo dado. */
export function eventForDoubleClick(type: string): string {
  return defaultEvent(type)
}
