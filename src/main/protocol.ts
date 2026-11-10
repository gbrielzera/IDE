// Limites e validação do protocolo JSON-por-linha entre a IDE e o runtime Python (sem depender do Electron).

/** Tamanho máximo de uma mensagem (uma linha), em caracteres. Passou disso, a linha é descartada. */
export const MAX_MESSAGE_CHARS = 4 * 1024 * 1024

/** Se o buffer passa disto sem nenhuma quebra de linha, o runtime está com defeito (ou travado escrevendo): é encerrado. */
export const MAX_PENDING_CHARS = 8 * 1024 * 1024

/** Texto de console maior que isto é cortado antes de ir para a tela. */
export const MAX_CONSOLE_CHARS = 20_000

/** Alterações de propriedades por mensagem `patch`. */
export const MAX_PATCH_CHANGES = 5000

export interface SplitResult {
  lines: string[]
  /** Quantas linhas completas passaram do limite e foram descartadas. */
  dropped: number
  /** Chegou lixo demais sem quebra de linha: o chamador deve encerrar o processo. */
  overflow: boolean
}

/** Junta pedaços de texto do stdout e devolve as linhas completas, aplicando os limites. */
export class LineSplitter {
  private pending = ''

  push(chunk: string): SplitResult {
    this.pending += chunk
    const lines: string[] = []
    let dropped = 0
    let nl: number
    while ((nl = this.pending.indexOf('\n')) >= 0) {
      const line = this.pending.slice(0, nl).trim()
      this.pending = this.pending.slice(nl + 1)
      if (!line) continue
      if (line.length > MAX_MESSAGE_CHARS) dropped++
      else lines.push(line)
    }
    const overflow = this.pending.length > MAX_PENDING_CHARS
    if (overflow) this.pending = ''
    return { lines, dropped, overflow }
  }
}

export function clampText(text: string, max = MAX_CONSOLE_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}… (cortado: ${text.length - max} caracteres a mais)` : text
}

export interface PatchChange {
  id: string
  prop: string
  value: unknown
}

function isJsonValue(v: unknown, depth = 0): boolean {
  if (depth > 20) return false
  if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) return typeof v !== 'number' || Number.isFinite(v)
  if (Array.isArray(v)) return v.length <= 100_000 && v.every((x) => isJsonValue(x, depth + 1))
  if (typeof v === 'object') return Object.values(v as object).every((x) => isJsonValue(x, depth + 1))
  return false
}

/** Mantém só as alterações bem formadas de um `patch` (id e prop texto, valor JSON); o resto é descartado. */
export function sanitizePatch(raw: unknown): { changes: PatchChange[]; rejected: number } {
  const list = Array.isArray(raw) ? raw : []
  const changes: PatchChange[] = []
  let rejected = Math.max(0, list.length - MAX_PATCH_CHANGES)
  for (const c of list.slice(0, MAX_PATCH_CHANGES)) {
    const ok =
      typeof c === 'object' && c !== null && typeof (c as PatchChange).id === 'string' && typeof (c as PatchChange).prop === 'string' && isJsonValue((c as PatchChange).value)
    if (ok) changes.push({ id: (c as PatchChange).id, prop: (c as PatchChange).prop, value: (c as PatchChange).value })
    else rejected++
  }
  return { changes, rejected }
}
