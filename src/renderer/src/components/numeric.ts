// Contas dos componentes numéricos (NumericField, Slider, ProgressBar), iguais no editor e na execução.

export function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** Faixa válida: se o máximo vier menor que o mínimo, vale o mínimo. */
export function rangeOf(p: Record<string, unknown>): { min: number; max: number } {
  // Sem negativos (NumericField com "Aceitar negativos" desligado), o mínimo nunca fica abaixo de zero.
  const min = p.allowNegative === false ? Math.max(0, num(p.minValue, 0)) : num(p.minValue, 0)
  return { min, max: Math.max(min, num(p.maxValue, 100)) }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Quanto da barra está preenchido, de 0 a 100. */
export function percentOf(p: Record<string, unknown>): number {
  const { min, max } = rangeOf(p)
  return max === min ? 0 : Math.round(((clamp(num(p.value), min, max) - min) / (max - min)) * 100)
}

/** Texto do número com as casas decimais pedidas (0 a 6). */
export function formatNumber(value: unknown, decimals: unknown): string {
  const d = clamp(Math.round(num(decimals, 0)), 0, 6)
  return num(value).toFixed(d)
}

const ALLOWED = new Set(['http:', 'https:', 'mailto:'])

/** Só endereços http, https e mailto podem ser abertos por um Link. */
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '' || raw.length > 2048) return null
  try {
    const url = new URL(raw.trim())
    return ALLOWED.has(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

/** Símbolo de cada tipo de aviso (Alert). */
export const ALERT_ICON: Record<string, string> = { info: 'ℹ', success: '✔', warning: '⚠', error: '✖' }

/** Texto do interruptor conforme o estado: `onText`/`offText` quando preenchidos, senão `text`. */
export function toggleText(p: Record<string, unknown>): string {
  const pick = p.checked === true ? p.onText : p.offText
  return typeof pick === 'string' && pick !== '' ? pick : typeof p.text === 'string' ? p.text : ''
}
