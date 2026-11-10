// Leitura validada e escrita do arquivo de formulário (*.form.json).
import { FORM_FORMAT, FORM_SCHEMA_VERSION, type FormDocument, type FormNode } from '@shared/project'
import { isUid, newUid } from '@shared/uid'
import { idProblem } from './ids'
import { migrateForm } from './migrate'

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} deve ser um número.`)
  return v
}

function parseNodes(value: unknown, seen: Set<string>, uids: Set<string>, repaired: { count: number }): FormNode[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('"children" deve ser uma lista.')
  return value.map((raw): FormNode => {
    if (!isObject(raw)) throw new Error('Componente inválido (esperado um objeto).')
    const id = raw.id
    if (typeof id !== 'string') throw new Error('Componente sem "id".')
    const problem = idProblem(id)
    if (problem) throw new Error(`ID "${id}" inválido: ${problem}`)
    if (seen.has(id)) throw new Error(`ID "${id}" duplicado no formulário.`)
    seen.add(id)
    if (typeof raw.type !== 'string') throw new Error(`Componente "${id}" sem "type".`)
    // Cada componente tem um uid único; se faltar, estiver mal formado ou repetido (arquivo editado à mão), gera outro.
    let uid: string
    if (isUid(raw.uid) && !uids.has(raw.uid)) uid = raw.uid
    else {
      uid = newUid()
      repaired.count++
    }
    uids.add(uid)
    const node: FormNode = {
      uid,
      id,
      type: raw.type,
      x: num(raw.x, `${id}.x`),
      y: num(raw.y, `${id}.y`),
      width: num(raw.width, `${id}.width`),
      height: num(raw.height, `${id}.height`),
      props: isObject(raw.props) ? raw.props : {}
    }
    if (raw.children !== undefined) node.children = parseNodes(raw.children, seen, uids, repaired)
    if (raw.tab !== undefined) node.tab = num(raw.tab, `${id}.tab`)
    return node
  })
}

export interface ParsedForm {
  doc: FormDocument
  /** Versão do arquivo antes de migrar (igual à atual se não houve migração). */
  fromVersion: number
  /** Houve migração ou reparo: o arquivo só é atualizado no próximo salvamento. */
  upgraded: boolean
  /** Quantos uids foram reparados (faltando, inválidos ou repetidos) numa versão que já deveria tê-los. */
  repairedUids: number
}

/** Lê um formulário, migrando versões antigas (veja migrate.ts) e reparando uids. */
export function parseFormDocumentEx(text: string): ParsedForm {
  const parsed: unknown = JSON.parse(text)
  if (!isObject(parsed) || parsed.format !== FORM_FORMAT) throw new Error('O arquivo não é um formulário VForm.')
  const migrated = migrateForm({ ...parsed, version: typeof parsed.version === 'number' ? parsed.version : 1 })
  const raw = migrated.doc
  const name = typeof raw.name === 'string' ? raw.name : 'Form'
  const repaired = { count: 0 }
  const doc: FormDocument = {
    format: FORM_FORMAT,
    version: FORM_SCHEMA_VERSION,
    name,
    title: typeof raw.title === 'string' ? raw.title : name,
    width: typeof raw.width === 'number' ? raw.width : 640,
    height: typeof raw.height === 'number' ? raw.height : 480,
    children: parseNodes(raw.children, new Set(), new Set(), repaired)
  }
  // O reparo de uids só conta quando o arquivo já era da versão atual (na migração, todos são novos de propósito).
  const repairedUids = migrated.applied.length === 0 ? repaired.count : 0
  return { doc, fromVersion: migrated.from, upgraded: migrated.applied.length > 0 || repairedUids > 0, repairedUids }
}

export function parseFormDocument(text: string): FormDocument {
  return parseFormDocumentEx(text).doc
}

export function serializeForm(doc: FormDocument): string {
  return JSON.stringify(doc, null, 2) + '\n'
}
