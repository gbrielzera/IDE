// A API Python que o script enxerga (form.<id>.<membro>), usada para autocompletar e verificar o código.
// Espelha python/vform_runtime/components.py: um teste confere que as tabelas de eventos não divergem.
import type { FormDocument } from '@shared/project'
import { allPropDefs, CATALOG_BY_TYPE, type PropType } from '../components/catalog'
import { walk } from './tree'

/** Eventos por tipo (nome usado em `@form.x.on_<evento>`). */
export const EVENTS: Record<string, string[]> = {
  Label: ['click'],
  Button: ['click'],
  Image: ['click'],
  Panel: ['click'],
  TextField: ['change'],
  TextArea: ['change'],
  CheckBox: ['change'],
  RadioGroup: ['change'],
  ComboBox: ['change'],
  ListBox: ['change', 'double_click'],
  Tabs: ['change'],
  Table: ['change']
}

/** Evento criado pelo duplo clique no componente (o mais comum de cada tipo). */
export function defaultEvent(type: string): string {
  return EVENTS[type]?.[0] ?? 'click'
}

export type MemberKind = 'component' | 'property' | 'method' | 'event'

export interface Member {
  name: string
  kind: MemberKind
  detail: string
  doc?: string
  /** Texto a inserir (snippet do Monaco) quando difere do nome, ex.: `add_item($0)`. */
  insert?: string
}

export function toSnake(name: string): string {
  return name.replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase()
}

const TYPE_LABEL: Record<PropType, string> = {
  string: 'texto',
  text: 'texto',
  number: 'número',
  boolean: 'sim/não',
  color: 'cor',
  enum: 'opção',
  items: 'lista'
}

const COMMON_NUMERIC = ['x', 'y', 'width', 'height']
const GEOMETRY_DOC: Record<string, string> = {
  x: 'Posição horizontal (px), relativa ao pai.',
  y: 'Posição vertical (px), relativa ao pai.',
  width: 'Largura (px).',
  height: 'Altura (px).'
}

const EVENT_DOC: Record<string, string> = {
  click: 'Quando o usuário clica.',
  change: 'Quando o valor/seleção muda. O handler pode receber `ev` (ev.value, ev.index, ev.checked...).',
  double_click: 'Quando o usuário dá dois cliques num item.'
}

/** Todos os membros do componente de um tipo: propriedades, métodos e eventos. */
export function membersOf(type: string): Member[] {
  const def = CATALOG_BY_TYPE[type]
  if (!def) return []
  const { own, common } = allPropDefs(type)
  const out = new Map<string, Member>()
  const add = (m: Member): void => {
    if (!out.has(m.name)) out.set(m.name, m)
  }

  for (const key of COMMON_NUMERIC) add({ name: key, kind: 'property', detail: 'número', doc: GEOMETRY_DOC[key] })
  const keys = new Set<string>()
  for (const p of [...own, ...common]) {
    keys.add(p.key)
    add({
      name: toSnake(p.key),
      kind: 'property',
      detail: TYPE_LABEL[p.type],
      doc: p.options ? `${p.label}. Opções: ${p.options.join(', ')}` : p.label
    })
  }

  if (type === 'TextField' || type === 'TextArea') add({ name: 'text', kind: 'property', detail: 'texto', doc: 'Apelido de `value`.' })
  if (type === 'Table') {
    keys.add('rows')
    add({ name: 'rows', kind: 'property', detail: 'lista', doc: 'Linhas da tabela (lista de listas).' })
    add({ name: 'selected_index', kind: 'property', detail: 'número', doc: 'Linha selecionada (-1 = nenhuma).' })
  }
  if (keys.has('items') && keys.has('selectedIndex'))
    add({ name: 'selected_item', kind: 'property', detail: 'valor', doc: 'O item selecionado (None se não há).' })
  add({ name: 'id', kind: 'property', detail: 'texto (somente leitura)', doc: 'O ID do componente.' })
  add({ name: 'type', kind: 'property', detail: 'texto (somente leitura)', doc: 'O tipo do componente.' })

  if (keys.has('items') || keys.has('tabs')) {
    add({ name: 'add_item', kind: 'method', detail: 'add_item(item)', doc: 'Acrescenta um item ao final.', insert: 'add_item($0)' })
    add({ name: 'remove_item', kind: 'method', detail: 'remove_item(item)', doc: 'Remove o primeiro item igual a `item`.', insert: 'remove_item($0)' })
  }
  if (type === 'Table') add({ name: 'add_row', kind: 'method', detail: 'add_row(linha)', doc: 'Acrescenta uma linha (lista de valores).', insert: 'add_row($0)' })
  if (keys.has('items') || keys.has('tabs') || type === 'Table') {
    add({ name: 'remove_at', kind: 'method', detail: 'remove_at(índice)', doc: 'Remove o item da posição `índice`.', insert: 'remove_at($0)' })
    add({ name: 'clear', kind: 'method', detail: 'clear()', doc: 'Remove todos os itens e limpa a seleção.', insert: 'clear()' })
  }
  add({ name: 'on', kind: 'method', detail: 'on(evento, função)', doc: 'Registra um handler: `btn.on("click", fn)`.', insert: 'on("$1", $0)' })

  for (const event of EVENTS[type] ?? [])
    add({ name: `on_${event}`, kind: 'event', detail: 'evento (decorador)', doc: EVENT_DOC[event], insert: `on_${event}` })
  return [...out.values()]
}

export const APP_MEMBERS: Member[] = [
  { name: 'title', kind: 'property', detail: 'texto', doc: 'Título da janela.' },
  { name: 'show_message', kind: 'method', detail: 'show_message(texto, título="")', doc: 'Mostra uma caixa de mensagem.', insert: 'show_message($0)' },
  { name: 'close', kind: 'method', detail: 'close()', doc: 'Fecha a janela de execução.', insert: 'close()' }
]

export const FORM_EXTRAS: Member[] = [
  { name: 'on_load', kind: 'event', detail: 'evento (decorador)', doc: 'Roda quando o formulário termina de carregar.' }
]

/** Componentes do formulário como membros de `form.`. */
export function componentMembers(doc: FormDocument | null): Member[] {
  const out: Member[] = []
  if (doc) walk(doc, (n) => out.push({ name: n.id, kind: 'component', detail: n.type, doc: `Componente ${n.type}` }))
  return out
}

/** Procura o tipo de um componente pelo ID. */
export function typeOfId(doc: FormDocument | null, id: string): string | null {
  let found: string | null = null
  if (doc) walk(doc, (n) => (n.id === id ? (found = n.type) : undefined))
  return found
}

const FORM_RE = /(?<![\p{L}\p{N}_.])form\.[\p{L}\p{N}_]*$/u
const MEMBER_RE = /(?<![\p{L}\p{N}_.])form\.([\p{L}\p{N}_]+)\.[\p{L}\p{N}_]*$/u
const APP_RE = /(?<![\p{L}\p{N}_.])app\.[\p{L}\p{N}_]*$/u

/**
 * Sugestões para o texto da linha até o cursor, ou null se o contexto não é nosso
 * (`form.` → IDs; `form.id.` → membros do componente; `app.` → membros do app).
 */
export function completionsFor(linePrefix: string, doc: FormDocument | null): Member[] | null {
  const member = MEMBER_RE.exec(linePrefix)
  if (member) {
    const type = typeOfId(doc, member[1])
    return type ? membersOf(type) : []
  }
  if (FORM_RE.test(linePrefix)) return [...componentMembers(doc), ...FORM_EXTRAS]
  if (APP_RE.test(linePrefix)) return APP_MEMBERS
  return null
}
