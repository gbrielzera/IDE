import { lazy, Suspense } from 'react'
import { ErrorBoundary } from '../ErrorBoundary'
import { useActiveFormDoc, useIde } from '../store'
import { DesignSurface } from './DesignSurface'

// O Monaco é pesado (7 MB no app compilado; mais de mil módulos soltos no `npm run dev`, ~10 s). Fica fora do
// pacote inicial e é carregado em SEGUNDO PLANO logo depois de a IDE abrir (veja `preloadCodeEditor`), para já
// estar pronto no primeiro duplo clique. Se o clique vier antes de terminar, a aba mostra "Carregando...".
let editorModule: Promise<typeof import('./CodeEditor')> | null = null

export function preloadCodeEditor(): Promise<unknown> {
  editorModule ??= import('./CodeEditor')
  return editorModule
}

/** Carrega o editor e o aquece (veja `warmUpMonaco`). Só o carregamento é compartilhado com a aba; o aquecimento roda uma vez. */
let warmed: Promise<void> | null = null
export function preloadAndWarmCodeEditor(): Promise<void> {
  warmed ??= preloadCodeEditor().then((m) => (m as typeof import('./CodeEditor')).warmUpMonaco())
  return warmed
}

const CodeEditor = lazy(() => preloadCodeEditor() as Promise<typeof import('./CodeEditor')>)

export function CanvasArea(): React.JSX.Element {
  const forms = useIde((s) => s.project?.manifest.forms ?? [])
  const active = useIde((s) => s.activeForm)
  const view = useIde((s) => s.activeView)
  const scriptDirty = useIde((s) => s.scriptDirty)
  const openTab = useIde((s) => s.openTab)
  const doc = useActiveFormDoc()

  return (
    <section className="pane canvas-pane">
      <nav className="tabs">
        {forms.flatMap((f) => [
          <button
            key={`${f.name}:design`}
            className={`tab${f.name === active && view === 'design' ? ' active' : ''}`}
            data-testid={`tab-design-${f.name}`}
            onClick={() => openTab(f.name, 'design')}
          >
            {f.layout}
          </button>,
          <button
            key={`${f.name}:code`}
            className={`tab${f.name === active && view === 'code' ? ' active' : ''}`}
            data-testid={`tab-code-${f.name}`}
            onClick={() => openTab(f.name, 'code')}
          >
            {f.script}
            {scriptDirty[f.name] && (
              <span className="tab-dirty" title="Alterações não salvas">
                {' '}
                ●
              </span>
            )}
          </button>
        ])}
        <button className="tab tab-add" data-testid="add-form" title="Nova tela" onClick={() => useIde.getState().openFormDialog({ kind: 'new' })}>
          + tela
        </button>
      </nav>
      {view === 'code' && active ? (
        <ErrorBoundary
          onError={(e) => useIde.getState().log('error', `Não foi possível abrir o editor de código: ${e.message}`)}
          fallback={(e) => (
            <div className="canvas-scroll code-error" role="alert" data-testid="code-error">
              <p>
                <strong>Não foi possível abrir o editor de código.</strong>
              </p>
              <p className="muted">{e.message}</p>
              <p className="muted">O script continua no arquivo {forms.find((f) => f.name === active)?.script}; o formulário não foi afetado.</p>
              <button onClick={() => openTab(active, 'design')}>Voltar ao formulário</button>
            </div>
          )}
        >
          <Suspense fallback={<div className="canvas-scroll muted">Carregando o editor...</div>}>
            <CodeEditor key={active} formName={active} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <div className="canvas-scroll">
          {doc ? (
            <DesignSurface key={doc.name} doc={doc} />
          ) : (
            <p className="muted">Não foi possível ler o layout deste formulário (veja o Console).</p>
          )}
        </div>
      )}
    </section>
  )
}
