// Leitura validada e escrita do arquivo de formulário (*.form.json).
import { FORM_FORMAT, SCHEMA_VERSION, type FormDocument, type FormNode } from '@shared/project'
import { idProblem } from './ids'

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} deve ser um número.`)
  return v
}

function parseNodes(value: unknown, seen: Set<string>): FormNode[] {
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
    const node: FormNode = {
      id,
      type: raw.type,
      x: num(raw.x, `${id}.x`),
      y: num(raw.y, `${id}.y`),
      width: num(raw.width, `${id}.width`),
      height: num(raw.height, `${id}.height`),
      props: isObject(raw.props) ? raw.props : {}
    }
    if (raw.children !== undefined) node.children = parseNodes(raw.children, seen)
    if (raw.tab !== undefined) node.tab = num(raw.tab, `${id}.tab`)
    return node
  })
}

export function parseFormDocument(text: string): FormDocument {
  const raw: unknown = JSON.parse(text)
  if (!isObject(raw) || raw.format !== FORM_FORMAT) throw new Error('O arquivo não é um formulário VForm.')
  const version = typeof raw.version === 'number' ? raw.version : SCHEMA_VERSION
  if (version > SCHEMA_VERSION)
    throw new Error(`Formulário na versão ${version}; esta IDE lê até a versão ${SCHEMA_VERSION}.`)
  const name = typeof raw.name === 'string' ? raw.name : 'Form'
  return {
    format: FORM_FORMAT,
    version,
    name,
    title: typeof raw.title === 'string' ? raw.title : name,
    width: typeof raw.width === 'number' ? raw.width : 640,
    height: typeof raw.height === 'number' ? raw.height : 480,
    children: parseNodes(raw.children, new Set())
  }
}

export function serializeForm(doc: FormDocument): string {
  return JSON.stringify(doc, null, 2) + '\n'
}
