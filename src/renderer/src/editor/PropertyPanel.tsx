import { useState } from 'react'
import type { FormDocument, FormNode } from '@shared/project'
import { allPropDefs } from '../components/catalog'
import { setRects } from '../core/commands'
import { getProp } from '../core/props'
import { locate } from '../core/tree'
import { useActiveFormDoc, useIde } from '../store'
import { NumberEditor, PropEditor, TextEditor } from './PropEditors'

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="props-row">
      <dt title={label}>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Section({ title }: { title: string }): React.JSX.Element {
  return <div className="props-section">{title}</div>
}

function ComponentProps({ node }: { node: FormNode }): React.JSX.Element {
  const { renameComponent, setProp, edit } = useIde.getState()
  const [idError, setIdError] = useState<string | null>(null)
  const defs = allPropDefs(node.type)
  const rect = (key: 'x' | 'y' | 'width' | 'height', value: number): void =>
    edit((d) => setRects(d, { [node.id]: { [key]: value } }))

  return (
    <dl className="props">
      <Section title="Identificação" />
      <Row label="ID">
        <TextEditor
          value={node.id}
          testId="prop-id"
          invalid={idError !== null}
          onEdit={() => setIdError(null)}
          onCommit={(v) => setIdError(renameComponent(node.id, v.trim()))}
        />
        {idError && (
          <div className="prop-error" role="alert" data-testid="prop-id-error">
            {idError}
          </div>
        )}
      </Row>
      <Row label="Tipo">{node.type}</Row>

      <Section title="Posição e tamanho" />
      <Row label="X">
        <NumberEditor value={node.x} min={0} testId="prop-x" onCommit={(v) => rect('x', v)} />
      </Row>
      <Row label="Y">
        <NumberEditor value={node.y} min={0} testId="prop-y" onCommit={(v) => rect('y', v)} />
      </Row>
      <Row label="Largura">
        <NumberEditor value={node.width} min={8} testId="prop-width" onCommit={(v) => rect('width', v)} />
      </Row>
      <Row label="Altura">
        <NumberEditor value={node.height} min={8} testId="prop-height" onCommit={(v) => rect('height', v)} />
      </Row>

      {defs.own.length > 0 && <Section title="Propriedades" />}
      {defs.own.map((def) => (
        <Row key={def.key} label={def.label}>
          <PropEditor def={def} value={getProp(node, def.key)} onCommit={(v, txn) => setProp(node.id, def.key, v, txn)} />
        </Row>
      ))}

      {defs.common.length > 0 && <Section title="Aparência e estado" />}
      {defs.common.map((def) => (
        <Row key={def.key} label={def.label}>
          <PropEditor def={def} value={getProp(node, def.key)} onCommit={(v, txn) => setProp(node.id, def.key, v, txn)} />
        </Row>
      ))}
    </dl>
  )
}

function FormProps({ doc }: { doc: FormDocument }): React.JSX.Element {
  const { setFormProps } = useIde.getState()
  return (
    <dl className="props">
      <Section title="Formulário" />
      <Row label="Nome">{doc.name}</Row>
      <Row label="Título">
        <TextEditor value={doc.title} testId="prop-title" onCommit={(title) => setFormProps({ title })} />
      </Row>
      <Row label="Largura">
        <NumberEditor value={doc.width} min={100} max={4000} testId="prop-form-width" onCommit={(width) => setFormProps({ width })} />
      </Row>
      <Row label="Altura">
        <NumberEditor value={doc.height} min={100} max={4000} testId="prop-form-height" onCommit={(height) => setFormProps({ height })} />
      </Row>
    </dl>
  )
}

export function PropertyPanel(): React.JSX.Element {
  const doc = useActiveFormDoc()
  const selection = useIde((s) => s.selection)
  const node = doc && selection.length === 1 ? (locate(doc, selection[0])?.node ?? null) : null

  return (
    <section className="pane">
      <h2 className="pane-title">Propriedades</h2>
      <div className="pane-body" data-testid="properties">
        {!doc ? (
          <p className="muted">Nenhum formulário aberto.</p>
        ) : selection.length > 1 ? (
          <p>{selection.length} componentes selecionados</p>
        ) : node ? (
          // O `key` recria os editores ao trocar de componente (descarta rascunhos pendentes).
          <ComponentProps key={node.id} node={node} />
        ) : (
          <FormProps doc={doc} />
        )}
      </div>
    </section>
  )
}
