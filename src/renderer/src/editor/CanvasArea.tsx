import { lazy, Suspense } from 'react'
import { useActiveFormDoc, useIde } from '../store'
import { DesignSurface } from './DesignSurface'

// O Monaco é pesado: só é carregado na primeira vez que se abre uma aba de código.
const CodeEditor = lazy(() => import('./CodeEditor'))

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
      </nav>
      {view === 'code' && active ? (
        <Suspense fallback={<div className="canvas-scroll muted">Carregando o editor...</div>}>
          <CodeEditor key={active} formName={active} />
        </Suspense>
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
