// Tipos da execução de um formulário (IDE ⇄ janela de execução ⇄ runtime Python).
import type { FormDocument } from './project'

/** Um componente como o script Python o enxerga: tipo e todas as propriedades (já com os padrões). */
export interface RunComponent {
  type: string
  props: Record<string, unknown>
}

export interface RunPayload {
  formName: string
  /** Caminho do script, relativo à pasta do projeto (o main lê do disco). */
  scriptPath: string
  doc: FormDocument
  components: Record<string, RunComponent>
}

export interface RunInit {
  doc: FormDocument
  components: Record<string, RunComponent>
}

export type RunStartResult = { ok: true; runId: number } | { ok: false; error: string }

export interface RunConsoleMessage {
  level: 'info' | 'warn' | 'error'
  text: string
  line?: number
  file?: string
}

export interface RunEnded {
  /** Qual execução terminou (a IDE ignora avisos de execuções antigas). */
  runId: number
  reason: 'closed' | 'stopped' | 'crashed'
  code: number | null
}

/** Da janela de execução para o Python. */
export type RunToPython =
  | { type: 'sync'; id: string; prop: string; value: unknown }
  | { type: 'event'; id: string; name: string; args?: Record<string, unknown> }

export interface RunChange {
  id: string
  prop: string
  value: unknown
}

/** Do Python para a janela de execução. */
export type RunFromPython = { type: 'patch'; changes: RunChange[] }

export interface RunApi {
  // --- usadas pela IDE ---
  start(payload: RunPayload): Promise<RunStartResult>
  stop(): Promise<void>
  onConsole(cb: (msg: RunConsoleMessage) => void): () => void
  onEnded(cb: (ended: RunEnded) => void): () => void
  // --- usadas pela janela de execução ---
  init(): Promise<RunInit | null>
  ready(): void
  send(msg: RunToPython): void
  onMessage(cb: (msg: RunFromPython) => void): () => void
}
