// Lista estática por enquanto; no M2 ela passa a vir do catálogo de componentes (registry).
const COMPONENTS = [
  'Label',
  'TextField',
  'TextArea',
  'Button',
  'CheckBox',
  'RadioGroup',
  'ComboBox',
  'ListBox',
  'Image',
  'Panel',
  'Tabs',
  'Table'
]

export function Palette(): React.JSX.Element {
  return (
    <section className="pane">
      <h2 className="pane-title">Componentes</h2>
      <ul className="pane-body palette">
        {COMPONENTS.map((name) => (
          <li key={name} className="palette-item" title="Arrastar para o canvas chega no M1">
            {name}
          </li>
        ))}
      </ul>
    </section>
  )
}
