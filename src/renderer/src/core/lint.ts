// Verificação leve do script: avisa de IDs e propriedades que não existem (antes de executar).
import type { FormDocument } from '@shared/project'
import { APP_MEMBERS, componentMembers, membersOf, typeOfId } from './pyapi'

export interface Diagnostic {
  /** Linha (base 1) e colunas (base 1, fim exclusivo) do trecho com problema. */
  line: number
  startColumn: number
  endColumn: number
  message: string
}

/** Troca por espaços o que está dentro de strings e comentários, mantendo as posições. */
export function maskLine(line: string): string {
  let out = ''
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      out += ' '
      if (c === '\\') {
        out += ' '
        i++
      } else if (c === quote) quote = null
    } else if (c === '#') {
      return out + ' '.repeat(line.length - i)
    } else if (c === '"' || c === "'") {
      quote = c
      out += ' '
    } else out += c
  }
  return out
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

/** O nome mais parecido (ignorando maiúsculas), se for realmente próximo. */
export function closest(name: string, options: string[]): string | null {
  let best: string | null = null
  let bestDistance = Infinity
  for (const option of options) {
    const d = option.toLowerCase() === name.toLowerCase() ? 0 : distance(name.toLowerCase(), option.toLowerCase())
    if (d < bestDistance) {
      best = option
      bestDistance = d
    }
  }
  return best !== null && bestDistance <= Math.max(1, Math.floor(name.length / 3)) ? best : null
}

const hint = (name: string, options: string[]): string => {
  const near = closest(name, options)
  return near ? ` Você quis dizer '${near}'?` : ''
}

/** Problemas do script em relação ao formulário (IDs e membros inexistentes de `form` e `app`). */
export function lintScript(script: string, doc: FormDocument | null): Diagnostic[] {
  const out: Diagnostic[] = []
  const ids = componentMembers(doc).map((m) => m.name)
  const appNames = APP_MEMBERS.map((m) => m.name)

  script.split('\n').forEach((raw, index) => {
    const line = maskLine(raw)
    for (const m of line.matchAll(/(?<![\w.])form\.(\w+)(?:\.(\w+))?/g)) {
      const id = m[1]
      const idStart = m.index + 'form.'.length
      if (id === 'on_load') continue
      const type = typeOfId(doc, id)
      if (!type) {
        out.push({
          line: index + 1,
          startColumn: idStart + 1,
          endColumn: idStart + id.length + 1,
          message: `Não há componente com o ID '${id}' neste formulário.${hint(id, ids)}`
        })
      } else if (m[2] !== undefined) {
        const names = membersOf(type).map((x) => x.name)
        if (!names.includes(m[2])) {
          const start = idStart + id.length + 1
          out.push({
            line: index + 1,
            startColumn: start + 1,
            endColumn: start + m[2].length + 1,
            message: `O componente '${id}' (${type}) não tem '${m[2]}'.${hint(m[2], names)}`
          })
        }
      }
    }
    for (const m of line.matchAll(/(?<![\w.])app\.(\w+)/g)) {
      if (!appNames.includes(m[1])) {
        const start = m.index + 'app.'.length
        out.push({
          line: index + 1,
          startColumn: start + 1,
          endColumn: start + m[1].length + 1,
          message: `'app' não tem '${m[1]}'. Disponíveis: ${appNames.join(', ')}.`
        })
      }
    }
  })
  return out
}

