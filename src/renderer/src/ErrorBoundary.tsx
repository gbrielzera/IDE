import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** O que mostrar no lugar do conteúdo que falhou. */
  fallback(error: Error): ReactNode
  /** Chamado uma vez com o erro (para registrar no console da IDE, por exemplo). */
  onError?(error: Error): void
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Sem isto, um erro ao desenhar (ou ao carregar um pedaço sob demanda, como o editor de código) faz o React
 * desmontar a tela inteira: o usuário vê uma janela em branco e nenhuma explicação.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erro na interface:', error, info.componentStack)
    this.props.onError?.(error)
  }

  render(): ReactNode {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children
  }
}
