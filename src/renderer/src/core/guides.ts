// Guias inteligentes (como no Figma): ao mover ou redimensionar, as bordas e o centro do que está sendo
// arrastado "grudam" nas bordas e nos centros dos vizinhos e do pai, e as linhas de alinhamento aparecem.
import type { Rect } from './commands'

export const GUIDE_THRESHOLD = 5

export interface Lines {
  x: number[]
  y: number[]
}

export interface GuideSnap {
  /** Quanto somar à posição para encaixar (0 se nada está perto). */
  dx: number
  dy: number
  /** Posições (no mesmo sistema de coordenadas) das linhas a desenhar: verticais (x) e horizontais (y). */
  v: number[]
  h: number[]
}

/** As três linhas de cada eixo de um retângulo: início, centro e fim. */
export function linesOf(r: Rect): Lines {
  return { x: [r.x, r.x + r.width / 2, r.x + r.width], y: [r.y, r.y + r.height / 2, r.y + r.height] }
}

function nearest(moving: number[], targets: number[], threshold: number): { delta: number; line: number } | null {
  let best: { delta: number; line: number } | null = null
  for (const m of moving)
    for (const t of targets) {
      const delta = t - m
      if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best.delta))) best = { delta, line: t }
    }
  return best
}

/**
 * Compara as linhas de quem se move com as dos alvos (vizinhos e pai) e devolve o ajuste que encaixa na mais
 * próxima, dentro do limite, mais as linhas que ficam alinhadas depois do ajuste.
 */
export function snapToGuides(moving: Lines, targets: readonly Rect[], threshold = GUIDE_THRESHOLD): GuideSnap {
  const tx: number[] = []
  const ty: number[] = []
  for (const t of targets) {
    const l = linesOf(t)
    tx.push(...l.x)
    ty.push(...l.y)
  }
  const bx = nearest(moving.x, tx, threshold)
  const by = nearest(moving.y, ty, threshold)
  const dx = bx?.delta ?? 0
  const dy = by?.delta ?? 0

  // Depois do ajuste, mostra TODAS as linhas dos alvos que coincidem com alguma linha de quem se move.
  const aligned = (mine: number[], theirs: number[], d: number): number[] => [
    ...new Set(theirs.filter((t) => mine.some((m) => Math.abs(m + d - t) < 0.5)))
  ]
  return { dx, dy, v: aligned(moving.x, tx, dx), h: aligned(moving.y, ty, dy) }
}
