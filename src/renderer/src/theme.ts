export type Theme = 'dark' | 'light'

const KEY = 'vform.theme'

/** O visual padrão é o claro e suave; o escuro só entra se o usuário escolher. */
const DEFAULT_THEME: Theme = 'light'

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
}

export function initTheme(): void {
  document.documentElement.dataset.theme = storedTheme() ?? DEFAULT_THEME
}
