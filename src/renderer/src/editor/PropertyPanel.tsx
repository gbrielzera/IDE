import { useActiveFormDoc } from '../store'

export function PropertyPanel(): React.JSX.Element {
  const doc = useActiveFormDoc()

  return (
    <section className="pane">
      <h2 className="pane-title">Propriedades</h2>
      <div className="pane-body">
        {!doc ? (
          <p className="muted">Selecione um formulário ou componente.</p>
        ) : (
          <dl className="props">
            <dt>Tipo</dt>
            <dd>Form</dd>
            <dt>Nome</dt>
            <dd>{doc.name}</dd>
            <dt>Título</dt>
            <dd>{doc.title}</dd>
            <dt>Largura</dt>
            <dd>{doc.width}</dd>
            <dt>Altura</dt>
            <dd>{doc.height}</dd>
          </dl>
        )}
        <p className="muted small">A edição de propriedades chega no M2.</p>
      </div>
    </section>
  )
}
