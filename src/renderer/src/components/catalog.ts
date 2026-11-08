// Catálogo de componentes (dados puros, sem React): tamanho padrão e schema de propriedades.

export type PropType = 'string' | 'text' | 'number' | 'boolean' | 'color' | 'enum' | 'items'

export interface PropDef {
  key: string
  label: string
  type: PropType
  default: unknown
  options?: readonly string[]
  min?: number
  max?: number
}

/**
 * Propriedades comuns de aparência/estado. Só são gravadas no arquivo quando diferem do padrão,
 * para o JSON do formulário continuar enxuto.
 */
export const COMMON_PROPS: Record<string, PropDef> = {
  enabled: { key: 'enabled', label: 'Habilitado', type: 'boolean', default: true },
  visible: { key: 'visible', label: 'Visível', type: 'boolean', default: true },
  fontSize: { key: 'fontSize', label: 'Tamanho da fonte', type: 'number', default: 12, min: 6, max: 72 },
  bold: { key: 'bold', label: 'Negrito', type: 'boolean', default: false },
  italic: { key: 'italic', label: 'Itálico', type: 'boolean', default: false },
  color: { key: 'color', label: 'Cor do texto', type: 'color', default: '' },
  background: { key: 'background', label: 'Cor de fundo', type: 'color', default: '' }
}

const TEXT_COMMON = ['enabled', 'visible', 'fontSize', 'bold', 'italic', 'color', 'background']
const BOX_COMMON = ['enabled', 'visible', 'background']

export interface ComponentDef {
  type: string
  label: string
  width: number
  height: number
  /** Container aceita filhos soltos dentro dele. */
  container?: boolean
  /** Espaço no topo ocupado pelo próprio componente (ex.: abas); os filhos começam abaixo dele. */
  insetTop?: number
  /** Propriedades específicas; os padrões são gravados ao criar o componente. */
  schema: PropDef[]
  /** Chaves de COMMON_PROPS que este componente aceita. */
  common: string[]
}

export const TABS_HEADER_HEIGHT = 24

const str = (key: string, label: string, def = ''): PropDef => ({ key, label, type: 'string', default: def })
const bool = (key: string, label: string, def = false): PropDef => ({ key, label, type: 'boolean', default: def })
const items = (key: string, label: string, def: string[]): PropDef => ({ key, label, type: 'items', default: def })
const index = (key: string, label: string, def: number, min = -1): PropDef => ({
  key,
  label,
  type: 'number',
  default: def,
  min
})

export const CATALOG: ComponentDef[] = [
  {
    type: 'Label',
    label: 'Label',
    width: 120,
    height: 24,
    schema: [
      str('text', 'Texto', 'Label'),
      { key: 'align', label: 'Alinhamento', type: 'enum', default: 'left', options: ['left', 'center', 'right'] }
    ],
    common: TEXT_COMMON
  },
  {
    type: 'TextField',
    label: 'TextField',
    width: 160,
    height: 28,
    schema: [str('value', 'Valor'), str('placeholder', 'Dica (placeholder)'), bool('readOnly', 'Somente leitura')],
    common: TEXT_COMMON
  },
  {
    type: 'TextArea',
    label: 'TextArea',
    width: 200,
    height: 80,
    schema: [{ key: 'value', label: 'Valor', type: 'text', default: '' }, bool('readOnly', 'Somente leitura')],
    common: TEXT_COMMON
  },
  {
    type: 'Button',
    label: 'Button',
    width: 96,
    height: 30,
    schema: [str('text', 'Texto', 'Button')],
    common: TEXT_COMMON
  },
  {
    type: 'CheckBox',
    label: 'CheckBox',
    width: 120,
    height: 24,
    schema: [str('text', 'Texto', 'CheckBox'), bool('checked', 'Marcado')],
    common: TEXT_COMMON
  },
  {
    type: 'RadioGroup',
    label: 'RadioGroup',
    width: 140,
    height: 64,
    schema: [items('items', 'Itens', ['Opção 1', 'Opção 2']), index('selectedIndex', 'Índice selecionado', 0)],
    common: TEXT_COMMON
  },
  {
    type: 'ComboBox',
    label: 'ComboBox',
    width: 160,
    height: 28,
    schema: [items('items', 'Itens', ['Item 1', 'Item 2']), index('selectedIndex', 'Índice selecionado', -1)],
    common: TEXT_COMMON
  },
  {
    type: 'ListBox',
    label: 'ListBox',
    width: 160,
    height: 100,
    schema: [
      items('items', 'Itens', ['Item 1', 'Item 2', 'Item 3']),
      index('selectedIndex', 'Índice selecionado', -1)
    ],
    common: TEXT_COMMON
  },
  {
    type: 'Image',
    label: 'Image',
    width: 120,
    height: 90,
    schema: [
      str('source', 'Arquivo de imagem'),
      { key: 'stretch', label: 'Ajuste', type: 'enum', default: 'fit', options: ['none', 'fit', 'fill'] }
    ],
    common: BOX_COMMON
  },
  {
    type: 'Panel',
    label: 'Panel',
    width: 240,
    height: 160,
    container: true,
    schema: [
      {
        key: 'layout',
        label: 'Layout',
        type: 'enum',
        default: 'absolute',
        options: ['absolute', 'vertical', 'horizontal']
      },
      { key: 'gap', label: 'Espaço entre itens', type: 'number', default: 8, min: 0, max: 200 },
      { key: 'padding', label: 'Margem interna', type: 'number', default: 8, min: 0, max: 200 },
      {
        key: 'align',
        label: 'Alinhamento',
        type: 'enum',
        default: 'start',
        options: ['start', 'center', 'end', 'stretch']
      }
    ],
    common: BOX_COMMON
  },
  {
    type: 'Tabs',
    label: 'Tabs',
    width: 280,
    height: 180,
    container: true,
    insetTop: TABS_HEADER_HEIGHT,
    schema: [items('tabs', 'Abas', ['Aba 1', 'Aba 2']), index('selectedIndex', 'Aba selecionada', 0, 0)],
    common: TEXT_COMMON
  },
  {
    type: 'Table',
    label: 'Table',
    width: 300,
    height: 140,
    schema: [items('columns', 'Colunas', ['Coluna 1', 'Coluna 2', 'Coluna 3'])],
    common: TEXT_COMMON
  }
]

export const CATALOG_BY_TYPE: Record<string, ComponentDef> = Object.fromEntries(CATALOG.map((c) => [c.type, c]))

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** Propriedades gravadas num componente recém-criado (cópias independentes). */
export function defaultProps(type: string): Record<string, unknown> {
  const def = CATALOG_BY_TYPE[type]
  return Object.fromEntries((def?.schema ?? []).map((p) => [p.key, clone(p.default)]))
}

/** Definição de uma propriedade (específica ou comum) de um tipo de componente. */
export function propDef(type: string, key: string): PropDef | undefined {
  const def = CATALOG_BY_TYPE[type]
  if (!def) return undefined
  return def.schema.find((p) => p.key === key) ?? (def.common.includes(key) ? COMMON_PROPS[key] : undefined)
}

/** Todas as propriedades editáveis de um tipo: primeiro as específicas, depois as comuns. */
export function allPropDefs(type: string): { own: PropDef[]; common: PropDef[] } {
  const def = CATALOG_BY_TYPE[type]
  return { own: def?.schema ?? [], common: (def?.common ?? []).map((k) => COMMON_PROPS[k]) }
}
