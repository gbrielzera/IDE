import { ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { HIDE_WINDOWS } from './testMode'

function manualPath(): string | null {
  const candidates = [
    join(__dirname, '..', '..', 'docs', 'VForm.chm'), // dev e build (out/main → raiz)
    join(process.resourcesPath ?? '', 'docs', 'VForm.chm') // empacotado
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

export function registerHelpIpc(): void {
  ipcMain.handle('help:manual', async () => {
    const path = manualPath()
    if (!path) return { ok: false, error: 'O manual (docs/VForm.chm) não foi encontrado. Gere-o com "npm run manual".' }
    if (HIDE_WINDOWS) return { ok: true, path } // testes automáticos: não abre janela de ajuda na tela de ninguém
    const problem = await shell.openPath(path)
    return problem ? { ok: false, error: problem } : { ok: true, path }
  })
}
