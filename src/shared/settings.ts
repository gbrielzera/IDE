// Preferências do app (valem para todos os projetos e sobrevivem ao fechar a IDE).

export interface Settings {
  /** Pasta do último projeto aberto ou criado: os seletores de arquivo já abrem nela. */
  lastDir?: string
  /** Salva sozinho, pouco depois de cada alteração. */
  autosave: boolean
  /** Mantém a janela de execução aberta e a atualiza a cada alteração do formulário ou do script. */
  livePreview: boolean
  /** Réguas nas bordas do formulário (como no Figma). */
  rulers: boolean
}

export const DEFAULT_SETTINGS: Settings = { autosave: false, livePreview: false, rulers: true }

export interface SettingsApi {
  get(): Promise<Settings>
  set(patch: Partial<Settings>): Promise<Settings>
}

/** Lê o que veio do arquivo ignorando o que for inválido (um arquivo estragado nunca impede a IDE de abrir). */
export function normalizeSettings(raw: unknown): Settings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const settings: Settings = {
    autosave: r.autosave === true,
    livePreview: r.livePreview === true,
    rulers: r.rulers !== false // ligado por padrão
  }
  if (typeof r.lastDir === 'string' && r.lastDir !== '') settings.lastDir = r.lastDir
  return settings
}
