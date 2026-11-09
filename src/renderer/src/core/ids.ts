// IDs dos componentes: viram atributos de `form` no script Python (form.txtNome).

const PY_KEYWORDS = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def',
  'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'
]

/**
 * Nomes que o script já usa: `form` é o objeto do formulário e `on_load` é o decorador dele
 * (`form.on_load`), então nenhum componente pode ter esses nomes.
 */
const RESERVED = new Set([...PY_KEYWORDS, 'form', 'on_load'])

const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u

/** Retorna null se o ID for válido, ou a mensagem do problema. */
export function idProblem(id: string): string | null {
  if (id === '') return 'O ID não pode ser vazio.'
  if (!IDENTIFIER.test(id)) return 'Use apenas letras, números e _, sem começar por número.'
  if (RESERVED.has(id)) return `"${id}" é uma palavra reservada.`
  return null
}

export function isValidId(id: string): boolean {
  return idProblem(id) === null
}

/** Gera um ID livre a partir do tipo: Button → button1, button2... */
export function uniqueId(type: string, taken: ReadonlySet<string>): string {
  const base = type.charAt(0).toLowerCase() + type.slice(1)
  let n = 1
  while (taken.has(`${base}${n}`)) n++
  return `${base}${n}`
}
