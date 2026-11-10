import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import {
  PROJECT_FILE,
  PROJECT_FORMAT,
  SCHEMA_VERSION,
  newFormDocument,
  newFormScript,
  type LoadedProject,
  type ProjectManifest,
  type ProjectResult,
  type SaveResult
} from '@shared/project'
import { formatIssue, MAX_FORM_JSON_BYTES, MAX_PROJECT_JSON_BYTES, MAX_SCRIPT_BYTES, validateManifest } from '@shared/manifest'
import { insideProject, insideProjectReal } from './pathSafety'
import { writeFileSafely } from './safeWrite'
import { getSettings, updateSettings } from './settings'

const trustKey = (dir: string): string => resolve(dir).toLowerCase()

async function isTrusted(dir: string): Promise<boolean> {
  return (await getSettings()).trustedProjects.includes(trustKey(dir))
}

async function trustDir(dir: string): Promise<void> {
  const list = (await getSettings()).trustedProjects
  if (!list.includes(trustKey(dir))) await updateSettings({ trustedProjects: [...list, trustKey(dir)] })
}

/** Pasta do projeto aberto em cada janela. O renderer nunca escolhe onde gravar. */
const openDirs = new Map<number, string>()

const SAVABLE_EXTENSIONS = new Set(['.json', '.py', '.bak'])

/** Guarda a pasta do projeto como "última usada" (persistente: vale na próxima vez que o app abrir). */
function rememberDir(dir: string): void {
  void updateSettings({ lastDir: dir })
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Pasta do projeto aberto numa janela (ou undefined). */
export function getProjectDir(windowId: number): string | undefined {
  return openDirs.get(windowId)
}

export { insideProject, insideProjectReal }

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

async function readCapped(path: string, max: number, what: string): Promise<string> {
  const { size } = await fs.stat(path)
  if (size > max) throw new Error(`${what} é grande demais (${Math.round(size / 1024)} KB; o limite é ${Math.round(max / 1024)} KB).`)
  return fs.readFile(path, 'utf8')
}

async function readProject(dir: string): Promise<LoadedProject> {
  const raw = await readCapped(join(dir, PROJECT_FILE), MAX_PROJECT_JSON_BYTES, PROJECT_FILE)
  let manifest: ProjectManifest
  try {
    manifest = JSON.parse(raw) as ProjectManifest
  } catch {
    throw new Error(`${PROJECT_FILE} não é um JSON válido.`)
  }
  const problems = validateManifest(manifest).filter((i) => i.severity === 'error')
  if (problems.length > 0) throw new Error(problems.map(formatIssue).join('\n'))
  const files: Record<string, string> = { [PROJECT_FILE]: raw }
  for (const form of manifest.forms) {
    files[form.layout] = await readCapped(await insideProjectReal(dir, form.layout), MAX_FORM_JSON_BYTES, form.layout)
    files[form.script] = await readCapped(await insideProjectReal(dir, form.script), MAX_SCRIPT_BYTES, form.script)
  }
  return { dir, manifest, files }
}

async function pickFolder(win: BrowserWindow, title: string): Promise<string | null> {
  const { lastDir } = await getSettings()
  const res = await dialog.showOpenDialog(win, {
    title,
    defaultPath: lastDir ? dirname(lastDir) : undefined, // novo projeto: ao lado do último
    properties: ['openDirectory', 'createDirectory']
  })
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
}

async function newProject(e: IpcMainInvokeEvent): Promise<ProjectResult> {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return { ok: false, error: 'Janela não encontrada.' }
  const dir = await pickFolder(win, 'Escolha uma pasta vazia para o novo projeto')
  if (!dir) return { ok: false, canceled: true }
  try {
    if (await exists(join(dir, PROJECT_FILE)))
      return { ok: false, error: 'Essa pasta já contém um projeto. Use "Abrir projeto".' }
    const formName = 'Main'
    const manifest: ProjectManifest = {
      format: PROJECT_FORMAT,
      version: SCHEMA_VERSION,
      name: basename(dir),
      forms: [{ name: formName, layout: `${formName}.form.json`, script: `${formName}.py` }]
    }
    await fs.writeFile(join(dir, PROJECT_FILE), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    await fs.writeFile(join(dir, `${formName}.form.json`), JSON.stringify(newFormDocument(formName), null, 2) + '\n', 'utf8')
    await fs.writeFile(join(dir, `${formName}.py`), newFormScript(formName), 'utf8')
    await trustDir(dir) // quem cria o projeto é quem escreve o código
    const project = { ...(await readProject(dir)), trusted: true }
    openDirs.set(win.id, dir)
    rememberDir(dir)
    return { ok: true, project }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

/**
 * Seletor de ARQUIVO: um seletor de pasta do Windows só lista subpastas e esconde os arquivos,
 * o que dá a impressão de pasta vazia. Aqui o usuário enxerga e escolhe o project.json.
 */
async function pickProjectFile(win: BrowserWindow): Promise<string | null> {
  const { lastDir } = await getSettings()
  const res = await dialog.showOpenDialog(win, {
    title: `Abrir projeto — selecione o ${PROJECT_FILE}`,
    defaultPath: lastDir,
    properties: ['openFile'],
    filters: [
      { name: 'Projeto VForm', extensions: ['json'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  })
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
}

/** Aceita o project.json (o normal) ou a própria pasta do projeto. */
async function projectDirFrom(picked: string): Promise<string> {
  if ((await fs.stat(picked)).isDirectory()) return picked
  if (basename(picked).toLowerCase() !== PROJECT_FILE)
    throw new Error(`Selecione o arquivo ${PROJECT_FILE} da pasta do projeto.`)
  return dirname(picked)
}

async function openProject(e: IpcMainInvokeEvent): Promise<ProjectResult> {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return { ok: false, error: 'Janela não encontrada.' }
  const picked = await pickProjectFile(win)
  if (!picked) return { ok: false, canceled: true }
  try {
    const dir = await projectDirFrom(picked)
    if (!(await exists(join(dir, PROJECT_FILE)))) return { ok: false, error: `A pasta não tem ${PROJECT_FILE}.` }
    const project = { ...(await readProject(dir)), trusted: await isTrusted(dir) }
    openDirs.set(win.id, dir)
    rememberDir(dir)
    return { ok: true, project }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

async function saveProject(e: IpcMainInvokeEvent, files: unknown, discard?: unknown): Promise<SaveResult> {
  const win = BrowserWindow.fromWebContents(e.sender)
  const dir = win ? openDirs.get(win.id) : undefined
  if (!dir) return { ok: false, error: 'Nenhum projeto aberto.' }
  if (typeof files !== 'object' || files === null) return { ok: false, error: 'Dados inválidos.' }
  try {
    // Valida tudo antes de gravar qualquer arquivo.
    const writes: [string, string][] = []
    for (const [rel, content] of Object.entries(files)) {
      if (typeof content !== 'string') throw new Error(`Conteúdo inválido para ${rel}`)
      if (!SAVABLE_EXTENSIONS.has(extname(rel).toLowerCase())) throw new Error(`Tipo de arquivo não permitido: ${rel}`)
      writes.push([await insideProjectReal(dir, rel), content])
    }
    // Telas removidas: os arquivos não são apagados, só renomeados (dá para recuperar tirando o ".removido").
    const renames: [string, string][] = []
    if (discard !== undefined) {
      if (!Array.isArray(discard) || discard.some((r) => typeof r !== 'string')) throw new Error('Lista de remoção inválida.')
      for (const rel of discard as string[]) {
        if (!SAVABLE_EXTENSIONS.has(extname(rel).toLowerCase())) throw new Error(`Tipo de arquivo não permitido: ${rel}`)
        const from = await insideProjectReal(dir, rel)
        if (await exists(from)) renames.push([from, `${from}.removido`])
      }
    }
    for (const [full, content] of writes) {
      if (full.toLowerCase().endsWith('.bak') && (await exists(full))) continue // cópia de segurança: nunca sobrescreve
      await writeFileSafely(full, content)
    }
    for (const [from, to] of renames) {
      await fs.rm(to, { force: true })
      await fs.rename(from, to)
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

export function registerProjectIpc(): void {
  ipcMain.handle('project:new', newProject)
  ipcMain.handle('project:open', openProject)
  ipcMain.handle('project:save', saveProject)
  ipcMain.handle('project:trust', async (e: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const dir = win ? openDirs.get(win.id) : undefined
    if (dir) await trustDir(dir)
  })
}

export function forgetWindow(id: number): void {
  openDirs.delete(id)
}
