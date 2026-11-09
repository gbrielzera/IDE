import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const KEY = 'vform.theme'

/** O visual padrão é o claro e suave; o escuro (modo noturno) só entra se o usuário escolher. */
const DEFAULT_THEME: Theme = 'light'

const listeners = new Set<() => void>()

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    return null
  }
}

export function currentTheme(): Theme {
  return (document.documentElement.dataset.theme as Theme | undefined) ?? DEFAULT_THEME
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Preferência só não fica salva; o tema continua aplicado.
  }
  listeners.forEach((l) => l())
}

export function toggleTheme(): void {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
}

export function initTheme(): void {
  document.documentElement.dataset.theme = storedTheme() ?? DEFAULT_THEME
}

/** O tema atual como estado do React: componentes que o mostram se atualizam quando ele muda. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    currentTheme
  )
}
