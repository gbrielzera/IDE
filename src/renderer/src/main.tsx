import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './ErrorBoundary'
import { RunApp } from './runtime/RunWindow'
import { initTheme } from './theme'
import './styles.css'

initTheme()

// A janela de execução carrega a mesma página, com `#run` no endereço.
const isRunWindow = window.location.hash === '#run'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Última rede de proteção: um erro inesperado mostra uma mensagem em vez de uma janela em branco. */}
    <ErrorBoundary
      fallback={(error) => (
        <div className="fatal-error" role="alert">
          <h1>Algo deu errado</h1>
          <p>{error.message}</p>
          <p className="muted">Se você tinha alterações não salvas, elas ainda estão nesta janela: feche e abra o projeto só se não puder continuar.</p>
          <button onClick={() => window.location.reload()}>Recarregar a janela</button>
        </div>
      )}
    >
      {isRunWindow ? <RunApp /> : <App />}
    </ErrorBoundary>
  </StrictMode>
)
