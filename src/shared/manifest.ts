// Validação do manifesto do projeto (project.json). Pura: roda no main (ao abrir) e nos testes.
import { PROJECT_FORMAT, SCHEMA_VERSION, type ProjectManifest } from './project'

export interface Issue {
  severity: 'error' | 'warning'
  file?: string
  form?: string
  component?: string
  prop?: string
  message: string
}

export const MAX_FORMS = 200
export const MAX_PROJECT_JSON_BYTES = 1024 * 1024
export const MAX_FORM_JSON_BYTES = 8 * 1024 * 1024
export const MAX_SCRIPT_BYTES = 4 * 1024 * 1024

const NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u

/** Texto legível de um problema, com o lugar onde ele está. */
export function formatIssue(i: Issue): string {
  const where = [i.file, i.form && `tela ${i.form}`, i.component && `componente ${i.component}`, i.prop && `propriedade ${i.prop}`].filter(Boolean).join(' › ')
  return where ? `${where}: ${i.message}` : i.message
}

function badPath(p: unknown): string | null {
  if (typeof p !== 'string' || p === '') return 'caminho ausente'
  if (p.includes('\0')) return 'caminho com caractere inválido'
  if (/^([a-zA-Z]:|[\\/])/.test(p)) return 'caminho absoluto não é permitido'
  if (p.split(/[\\/]/).some((s) => s === '..')) return 'caminho com ".." não é permitido'
  return null
}

/** Confere o conteúdo de project.json. Devolve a lista de problemas (vazia = tudo certo). */
export function validateManifest(raw: unknown): Issue[] {
  const file = 'project.json'
  const issues: Issue[] = []
  const err = (message: string, form?: string): void => void issues.push({ severity: 'error', file, form, message })
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [{ severity: 'error', file, message: 'O arquivo não é um objeto JSON.' }]
  const m = raw as Partial<ProjectManifest>
  if (m.format !== PROJECT_FORMAT) err(`Não é um projeto VForm (formato "${String(m.format)}").`)
  if (typeof m.version !== 'number' || !Number.isInteger(m.version) || m.version < 1) err('Versão do projeto inválida.')
  else if (m.version > SCHEMA_VERSION) err(`Projeto na versão ${m.version}; esta IDE lê até a versão ${SCHEMA_VERSION}.`)
  if (typeof m.name !== 'string' || m.name.trim() === '') err('O projeto não tem nome.')
  if (!Array.isArray(m.forms) || m.forms.length === 0) {
    err('O projeto não tem nenhuma tela ("forms").')
    return issues
  }
  if (m.forms.length > MAX_FORMS) err(`Telas demais (${m.forms.length}); o limite é ${MAX_FORMS}.`)
  const names = new Set<string>()
  const paths = new Set<string>()
  for (const f of m.forms.slice(0, MAX_FORMS)) {
    const name = typeof f?.name === 'string' ? f.name : ''
    if (!NAME.test(name)) {
      err(`Nome de tela inválido: "${String(f?.name)}".`)
      continue
    }
    if (names.has(name.toLowerCase())) err('Nome de tela repetido.', name)
    names.add(name.toLowerCase())
    for (const [kind, p, ext] of [['layout', f.layout, '.form.json'], ['script', f.script, '.py']] as const) {
      const problem = badPath(p)
      if (problem) err(`${kind}: ${problem}.`, name)
      else if (!(p as string).toLowerCase().endsWith(ext)) err(`${kind} deve terminar em ${ext}.`, name)
      else {
        const key = (p as string).replace(/\\/g, '/').toLowerCase()
        if (paths.has(key)) err(`o arquivo ${p as string} é usado por mais de uma tela.`, name)
        paths.add(key)
      }
    }
  }
  return issues
}
