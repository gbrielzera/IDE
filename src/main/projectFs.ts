import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
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
import { writeFileSafely } from './safeWrite'
import { getSettings, updateSettings } from './settings'

/** Pasta do projeto aberto em cada janela. O renderer nunca escolhe onde gravar. */
const openDirs = new Map<number, string>()

const SAVABLE_EXTENSIONS = new Set(['.json', '.py'])

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

/** Resolve um caminho relativo garantindo que ele fique dentro da pasta do projeto. */
export function insideProject(dir: string, rel: string): string {
  if (isAbsolute(rel)) throw new Error(`Caminho absoluto não permitido: ${rel}`)
  const full = resolve(dir, rel)
  const back = relative(dir, full)
  if (back === '' || back.startsWith('..') || isAbsolute(back)) throw new Error(`Caminho fora do projeto: ${rel}`)
  return full
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

async function readProject(dir: string): Promise<LoadedProject> {
  const raw = await fs.readFile(join(dir, PROJECT_FILE), 'utf8')
  const manifest = JSON.parse(raw) as ProjectManifest
  if (manifest.format !== PROJECT_FORMAT) throw new Error(`${PROJECT_FILE} não é um projeto VForm.`)
  if (manifest.version > SCHEMA_VERSION)
    throw new Error(`Projeto na versão ${manifest.version}; esta IDE lê até a versão ${SCHEMA_VERSION}.`)
  const files: Record<string, string> = { [PROJECT_FILE]: raw }
  for (const form of manifest.forms) {
    for (const rel of [form.layout, form.script]) {
      files[rel] = await fs.readFile(insideProject(dir, rel), 'utf8')
    }
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
    const project = await readProject(dir)
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
    const project = await readProject(dir)
    openDirs.set(win.id, dir)
    rememberDir(dir)
    return { ok: true, project }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

async function saveProject(e: IpcMainInvokeEvent, files: unknown): Promise<SaveResult> {
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
      writes.push([insideProject(dir, rel), content])
    }
    for (const [full, content] of writes) await writeFileSafely(full, content)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

export function registerProjectIpc(): void {
  ipcMain.handle('project:new', newProject)
  ipcMain.handle('project:open', openProject)
  ipcMain.handle('project:save', saveProject)
}

export function forgetWindow(id: number): void {
  openDirs.delete(id)
}
