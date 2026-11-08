import type { FormNode } from '@shared/project'
import { useActiveFormDoc, useIde } from '../store'

function Row({ node, depth }: { node: FormNode; depth: number }): React.JSX.Element {
  const selected = useIde((s) => s.selection.includes(node.id))

  function onClick(e: React.MouseEvent): void {
    const { selection, select } = useIde.getState()
    if (e.shiftKey || e.ctrlKey || e.metaKey)
      select(selection.includes(node.id) ? selection.filter((id) => id !== node.id) : [...selection, node.id])
    else select([node.id])
  }

  return (
    <li>
      <button
        className={`tree-item${selected ? ' active' : ''}`}
        style={{ paddingLeft: 4 + depth * 14 }}
        data-testid={`tree-${node.id}`}
        onClick={onClick}
      >
        {node.id} <span className="muted">{node.type}</span>
        {node.tab !== undefined && <span className="muted"> · aba {node.tab + 1}</span>}
      </button>
      {node.children && node.children.length > 0 && (
        <ul className="tree">
          {node.children.map((c) => (
            <Row key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function OutlineTree(): React.JSX.Element {
  const doc = useActiveFormDoc()

  return (
    <section className="pane">
      <h2 className="pane-title">Estrutura</h2>
      <div className="pane-body">
        {!doc ? (
          <p className="muted">Nenhum formulário aberto.</p>
        ) : (
          <>
            <button className="tree-item" onClick={() => useIde.getState().select([])}>
              ▾ {doc.name}
            </button>
            {doc.children.length === 0 ? (
              <p className="muted tree-empty">sem componentes</p>
            ) : (
              <ul className="tree">
                {doc.children.map((n) => (
                  <Row key={n.id} node={n} depth={1} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  )
}
