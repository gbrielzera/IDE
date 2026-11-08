import { locate } from '../core/tree'
import { useActiveFormDoc, useIde } from '../store'

export function PropertyPanel(): React.JSX.Element {
  const doc = useActiveFormDoc()
  const selection = useIde((s) => s.selection)
  const node = doc && selection.length === 1 ? (locate(doc, selection[0])?.node ?? null) : null

  let rows: [string, string | number][] = []
  if (node) {
    rows = [
      ['ID', node.id],
      ['Tipo', node.type],
      ['X', node.x],
      ['Y', node.y],
      ['Largura', node.width],
      ['Altura', node.height]
    ]
  } else if (doc && selection.length === 0) {
    rows = [
      ['Tipo', 'Form'],
      ['Nome', doc.name],
      ['Título', doc.title],
      ['Largura', doc.width],
      ['Altura', doc.height]
    ]
  }

  return (
    <section className="pane">
      <h2 className="pane-title">Propriedades</h2>
      <div className="pane-body" data-testid="properties">
        {!doc ? (
          <p className="muted">Nenhum formulário aberto.</p>
        ) : selection.length > 1 ? (
          <p>{selection.length} componentes selecionados</p>
        ) : (
          <dl className="props">
            {rows.map(([k, v]) => (
              <div key={k} className="props-row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="muted small">A edição de propriedades chega no M2.</p>
      </div>
    </section>
  )
}
