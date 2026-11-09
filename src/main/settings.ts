import { app, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { normalizeSettings, type Settings } from '@shared/settings'
import { writeFileSafely } from './safeWrite'

let cache: Settings | null = null

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

export async function getSettings(): Promise<Settings> {
  if (cache) return cache
  try {
    cache = normalizeSettings(JSON.parse(await fs.readFile(settingsFile(), 'utf8')))
  } catch {
    cache = normalizeSettings(null) // primeira execução ou arquivo ilegível: padrões
  }
  return cache
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await getSettings()), ...patch })
  cache = next
  try {
    await writeFileSafely(settingsFile(), JSON.stringify(next, null, 2) + '\n')
  } catch {
    // Não conseguir gravar a preferência não deve atrapalhar o trabalho: ela vale até fechar o app.
  }
  return next
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: unknown) => {
    const p = typeof patch === 'object' && patch !== null ? (patch as Record<string, unknown>) : {}
    // Só chaves conhecidas, com o tipo certo.
    const clean: Partial<Settings> = {}
    if (typeof p.autosave === 'boolean') clean.autosave = p.autosave
    if (typeof p.livePreview === 'boolean') clean.livePreview = p.livePreview
    if (typeof p.rulers === 'boolean') clean.rulers = p.rulers
    return updateSettings(clean)
  })
}
