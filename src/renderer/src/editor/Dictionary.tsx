import { useEffect } from 'react'
import { allPropDefs, CATALOG, CATALOG_BY_TYPE } from '../components/catalog'
import { ATALHOS, COMPONENT_HELP, GUIDES, TERMS, type Topic } from '../core/glossary'
import { EVENTS, membersOf } from '../core/pyapi'
import { useIde } from '../store'
import { ComponentPreview } from './ComponentPreview'

function topicKey(t: Topic): string {
  return t.kind === 'component' ? `c:${t.type}` : t.kind === 'guide' ? `g:${t.id}` : `t:${t.index}`
}

/** Dicionário de componentes e termos, em linguagem simples (Ajuda → Dicionário, ou F1). */
export function Dictionary(): React.JSX.Element | null {
  const topic = useIde((s) => s.dictionary)
  const open = useIde((s) => s.openDictionary)
  const close = useIde((s) => s.closeDictionary)

  useEffect(() => {
    if (!topic) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [topic, close])

  if (!topic) return null
  const current = topicKey(topic)

  return (
    <div className="dict-backdrop" onPointerDown={close}>
      <div className="dict" role="dialog" aria-label="Dicionário" data-testid="dictionary" onPointerDown={(e) => e.stopPropagation()}>
        <div className="dict-head">
          <strong>Dicionário</strong>
          <button className="link" onClick={close} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="dict-body">
          <ul className="dict-index">
            <li className="dict-group">Guias</li>
            {GUIDES.map((g) => (
              <li key={g.id}>
                <button className={topicKey({ kind: 'guide', id: g.id }) === current ? 'on' : ''} onClick={() => open({ kind: 'guide', id: g.id })}>
                  {g.titulo}
                </button>
              </li>
            ))}
            <li className="dict-group">Componentes</li>
            {CATALOG.map((c) => (
              <li key={c.type}>
                <button
                  className={topicKey({ kind: 'component', type: c.type }) === current ? 'on' : ''}
                  onClick={() => open({ kind: 'component', type: c.type })}
                >
                  {c.label}
                </button>
              </li>
            ))}
            <li className="dict-group">Termos</li>
            {TERMS.map((t, i) => (
              <li key={t.nome}>
                <button className={topicKey({ kind: 'term', index: i }) === current ? 'on' : ''} onClick={() => open({ kind: 'term', index: i })}>
                  {t.nome}
                </button>
              </li>
            ))}
          </ul>
          <div className="dict-page" data-testid="dictionary-page">
            {topic.kind === 'component' ? (
              <ComponentPage type={topic.type} />
            ) : topic.kind === 'guide' ? (
              <GuidePage id={topic.id} />
            ) : (
              <TermPage index={topic.index} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Code({ children }: { children: string }): React.JSX.Element {
  return <pre className="dict-code">{children}</pre>
}

function GuidePage({ id }: { id: string }): React.JSX.Element {
  const guide = GUIDES.find((g) => g.id === id)
  if (!guide) return <p>Guia não encontrado.</p>
  return (
    <>
      <h3>{guide.titulo}</h3>
      {id === 'primeiros-passos' && (
        <>
          <p className="muted">Atalhos do teclado:</p>
          <ul className="dict-list">
            {ATALHOS.map((a) => (
              <li key={a.teclas}>
                <b>{a.teclas}</b> — {a.acao}
              </li>
            ))}
          </ul>
        </>
      )}
      {guide.blocos.map((b, i) =>
        b.tipo === 'code' ? (
          <Code key={i}>{b.texto}</Code>
        ) : b.tipo === 'li' ? (
          <ul key={i} className="dict-list">
            <li>{b.texto}</li>
          </ul>
        ) : (
          <p key={i}>{b.texto}</p>
        )
      )}
    </>
  )
}

function TermPage({ index }: { index: number }): React.JSX.Element {
  const term = TERMS[index]
  return (
    <>
      <h3>{term.nome}</h3>
      <p>{term.explicacao}</p>
      {term.exemplo && (
        <>
          <h4>Exemplo</h4>
          <Code>{term.exemplo}</Code>
        </>
      )}
    </>
  )
}

function ComponentPage({ type }: { type: string }): React.JSX.Element {
  const def = CATALOG_BY_TYPE[type]
  const help = COMPONENT_HELP[type]
  const { own } = allPropDefs(type)
  const events = EVENTS[type] ?? []
  const methods = membersOf(type).filter((m) => m.kind === 'method' && m.name !== 'on')
  return (
    <>
      <h3>{def.label}</h3>
      <div className="dict-preview">
        <ComponentPreview type={type} />
      </div>
      {help && (
        <>
          <p>{help.resumo}</p>
          <h4>Para que serve</h4>
          <p>{help.paraQue}</p>
          <h4>Exemplo no código</h4>
          <Code>{help.exemplo}</Code>
        </>
      )}
      {own.length > 0 && (
        <>
          <h4>Características que você pode mudar</h4>
          <ul className="dict-list">
            {own.map((p) => (
              <li key={p.key}>
                <b>{p.label}</b> — no código: <code>{membersOfName(type, p.key)}</code>
              </li>
            ))}
          </ul>
        </>
      )}
      {events.length > 0 && (
        <>
          <h4>O que ele avisa que aconteceu</h4>
          <ul className="dict-list">
            {events.map((e) => (
              <li key={e}>
                <code>@form.meu_id.on_{e}</code> — {EVENT_TEXT[e] ?? e}
              </li>
            ))}
          </ul>
        </>
      )}
      {methods.length > 0 && (
        <>
          <h4>O que você pode mandar ele fazer</h4>
          <ul className="dict-list">
            {methods.map((m) => (
              <li key={m.name}>
                <code>{m.detail}</code> — {m.doc}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

const EVENT_TEXT: Record<string, string> = {
  click: 'quando o usuário clica',
  change: 'quando o valor ou a escolha muda',
  double_click: 'quando o usuário dá dois cliques num item'
}

/** Nome da propriedade no código (snake_case), como em `form.meu_id.<nome>`. */
function membersOfName(type: string, key: string): string {
  const m = membersOf(type).find((x) => x.name === key.replace(/([A-Z])/g, '_$1').toLowerCase())
  return `form.meu_id.${m?.name ?? key}`
}
