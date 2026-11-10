/**
 * Modo de teste automatizado: com VFORM_HIDE_WINDOWS=1 as janelas abrem FORA da tela (sem roubar o foco), então os
 * testes e2e não ficam abrindo e fechando janelas em cima do que o usuário está fazendo. Nada disso afeta o uso normal.
 */
export const HIDE_WINDOWS = process.env.VFORM_HIDE_WINDOWS === '1'

/** Posição fora de qualquer monitor. */
const OFFSCREEN = -32000

/** Mostra a janela; em modo de teste, mostra sem foco e longe dos monitores (o Chromium segue renderizando). */
export function showUnlessHidden(win: { show(): void; showInactive(): void; setPosition(x: number, y: number): void }): void {
  if (!HIDE_WINDOWS) return win.show()
  win.setPosition(OFFSCREEN, OFFSCREEN)
  win.showInactive()
}

export const WEB_THROTTLING = true
