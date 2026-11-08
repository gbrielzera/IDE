// Catálogo de componentes (dados puros, sem React). O M2 acrescenta o schema de propriedades.

export interface ComponentDef {
  type: string
  label: string
  width: number
  height: number
  /** Container aceita filhos soltos dentro dele. */
  container?: boolean
  props: Record<string, unknown>
}

export const CATALOG: ComponentDef[] = [
  { type: 'Label', label: 'Label', width: 120, height: 24, props: { text: 'Label' } },
  { type: 'TextField', label: 'TextField', width: 160, height: 28, props: { value: '', placeholder: '' } },
  { type: 'TextArea', label: 'TextArea', width: 200, height: 80, props: { value: '' } },
  { type: 'Button', label: 'Button', width: 96, height: 30, props: { text: 'Button' } },
  { type: 'CheckBox', label: 'CheckBox', width: 120, height: 24, props: { text: 'CheckBox', checked: false } },
  {
    type: 'RadioGroup',
    label: 'RadioGroup',
    width: 140,
    height: 64,
    props: { items: ['Opção 1', 'Opção 2'], selectedIndex: 0 }
  },
  {
    type: 'ComboBox',
    label: 'ComboBox',
    width: 160,
    height: 28,
    props: { items: ['Item 1', 'Item 2'], selectedIndex: -1 }
  },
  {
    type: 'ListBox',
    label: 'ListBox',
    width: 160,
    height: 100,
    props: { items: ['Item 1', 'Item 2', 'Item 3'], selectedIndex: -1 }
  },
  { type: 'Image', label: 'Image', width: 120, height: 90, props: { source: '' } },
  { type: 'Panel', label: 'Panel', width: 240, height: 160, container: true, props: {} },
  { type: 'Tabs', label: 'Tabs', width: 280, height: 180, props: { tabs: ['Aba 1', 'Aba 2'], selectedIndex: 0 } },
  {
    type: 'Table',
    label: 'Table',
    width: 300,
    height: 140,
    props: { columns: ['Coluna 1', 'Coluna 2', 'Coluna 3'], rows: [] }
  }
]

export const CATALOG_BY_TYPE: Record<string, ComponentDef> = Object.fromEntries(CATALOG.map((c) => [c.type, c]))
