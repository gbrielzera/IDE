// Component Registry: a FONTE ÚNICA dos componentes (registry/components.json). O catálogo da IDE, o painel de
// propriedades, o autocompletar, o dicionário, o manual e o runtime Python leem os mesmos dados.
import raw from '../../registry/components.json'

export type PropType = 'string' | 'text' | 'number' | 'boolean' | 'color' | 'enum' | 'items'

export interface PropSpec {
  key: string
  label: string
  type: PropType
  default: unknown
  options?: readonly string[]
  min?: number
  max?: number
}

export interface EventSpec {
  name: string
  doc: string
}

export interface MethodSpec {
  detail: string
  doc: string
  insert?: string
}

export interface HelpSpec {
  resumo: string
  paraQue: string
  exemplo: string
}

export interface ComponentSpec {
  type: string
  label: string
  category: string
  width: number
  height: number
  container?: boolean
  insetTop?: number
  /** Propriedades específicas (gravadas ao criar o componente). */
  props: PropSpec[]
  /** Chaves de `commonProps` que o componente aceita. */
  common: string[]
  /** Propriedades que só existem em execução (não aparecem no painel). */
  runtimeProps?: Record<string, unknown>
  /** Apelidos no script: `{ text: 'value' }` faz `form.x.text` valer `form.x.value`. */
  aliases?: Record<string, string>
  /** Tem `selected_item` (o item selecionado), derivado de `items` + `selectedIndex`. */
  selectedItem?: boolean
  events: EventSpec[]
  /** Nomes (de `Registry.methods`) disponíveis neste componente. */
  methods: string[]
  help: HelpSpec
}

export interface Registry {
  version: number
  commonProps: Record<string, PropSpec>
  methods: Record<string, MethodSpec>
  components: ComponentSpec[]
}

export const REGISTRY = raw as unknown as Registry
