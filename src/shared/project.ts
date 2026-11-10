// Tipos do arquivo de projeto, compartilhados entre main, preload e renderer.
import type { RunApi } from './run'
import type { SettingsApi } from './settings'

export const PROJECT_FILE = 'project.json'
export const PROJECT_FORMAT = 'vform-project'
export const FORM_FORMAT = 'vform-form'
export const SCHEMA_VERSION = 1

export interface ProjectFormRef {
  /** Nome do formulário; também é a base dos arquivos (Main → Main.form.json + Main.py). */
  name: string
  layout: string
  script: string
}

export interface ProjectManifest {
  format: typeof PROJECT_FORMAT
  version: number
  name: string
  forms: ProjectFormRef[]
}

/** Um componente no formulário. x/y são relativos ao pai (formulário ou container). */
export interface FormNode {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  props: Record<string, unknown>
  children?: FormNode[]
  /** Só em filhos de um Tabs: índice da aba em que o componente aparece. */
  tab?: number
}

/** Documento de um formulário. */
export interface FormDocument {
  format: typeof FORM_FORMAT
  version: number
  name: string
  title: string
  width: number
  height: number
  children: FormNode[]
}

export interface LoadedProject {
  dir: string
  manifest: ProjectManifest
  /** Conteúdo dos arquivos do projeto, por caminho relativo à pasta do projeto. */
  files: Record<string, string>
}

export type ProjectResult =
  | { ok: true; project: LoadedProject }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string }

export type SaveResult = { ok: true } | { ok: false; error: string }

/** API exposta pelo preload em `window.vform`. */
export interface VformApi {
  newProject(): Promise<ProjectResult>
  openProject(): Promise<ProjectResult>
  /** Grava os arquivos; `discard` lista arquivos de telas removidas, que são renomeados para `.removido` (nunca apagados). */
  saveProject(files: Record<string, string>, discard?: string[]): Promise<SaveResult>
  run: RunApi
  /** Abre o manual (VForm.chm) no leitor de ajuda do Windows. */
  help: { openManual(): Promise<{ ok: true; path: string } | { ok: false; error: string }> }
  settings: SettingsApi
}

export function newFormDocument(name: string): FormDocument {
  return { format: FORM_FORMAT, version: SCHEMA_VERSION, name, title: name, width: 640, height: 480, children: [] }
}

export function newFormScript(name: string): string {
  return [
    `# Lógica do formulário ${name}.`,
    '# Componentes pelo ID:  form.txtNome.value   |   Eventos:  @form.btnOk.on_click',
    '# A janela:  app.title = "Meu app"  |  app.show_message("Olá")  |  app.close()',
    '',
    '@form.on_load',
    'def ao_carregar():',
    '    pass',
    ''
  ].join('\n')
}
