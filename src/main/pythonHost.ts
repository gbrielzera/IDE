import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

export interface PythonCommand {
  command: string
  /** Argumentos que vêm antes do script (ex.: `-3` do lançador `py`). */
  args: string[]
  version: string
}

export type PyMessage = { type: string } & Record<string, unknown>

const MIN_VERSION: [number, number] = [3, 10]
let cached: PythonCommand | null = null

function probe(command: string, args: string[]): Promise<PythonCommand | string> {
  return new Promise((resolve) => {
    execFile(
      command,
      [...args, '-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3])'],
      { timeout: 8000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(`${command}: não executou (${(err as NodeJS.ErrnoException).code ?? err.message})`)
        const m = /^(\d+)\.(\d+)\.(\d+)/.exec(stdout.trim())
        if (!m) return resolve(`${command}: resposta inesperada`)
        const [major, minor] = [Number(m[1]), Number(m[2])]
        if (major < MIN_VERSION[0] || (major === MIN_VERSION[0] && minor < MIN_VERSION[1]))
          return resolve(`${command}: Python ${m[0]} é antigo demais (precisa ${MIN_VERSION.join('.')}+)`)
        resolve({ command, args, version: m[0] })
      }
    )
  })
}

/**
 * Procura um Python 3.10+. `VFORM_PYTHON` (caminho do executável) tem prioridade e, se estiver
 * definido, é o único usado: assim um caminho errado aparece como erro, em vez de ser ignorado.
 */
export async function findPython(): Promise<PythonCommand> {
  if (cached) return cached
  const override = process.env['VFORM_PYTHON']
  const candidates: [string, string[]][] = override
    ? [[override, []]]
    : [['py', ['-3']], ['python', []], ['python3', []]]
  const problems: string[] = []
  for (const [command, args] of candidates) {
    const result = await probe(command, args)
    if (typeof result !== 'string') return (cached = result)
    problems.push(result)
  }
  throw new Error(
    `Python ${MIN_VERSION.join('.')}+ não encontrado. Instale em python.org (marque "Add to PATH") ` +
      `ou defina VFORM_PYTHON com o caminho do executável.\n${problems.join('\n')}`
  )
}

export interface HostHandlers {
  onMessage(msg: PyMessage): void
  /** O processo terminou; `stderr` traz o final do que ele escreveu no erro padrão. */
  onExit(code: number | null, stderr: string): void
}

/** O processo Python do runtime, com o protocolo de uma mensagem JSON por linha. */
export class PythonHost {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private stderr = ''
  private exited = false

  constructor(
    private readonly python: PythonCommand,
    private readonly runtimeScript: string,
    private readonly cwd: string,
    private readonly handlers: HostHandlers
  ) {}

  start(): void {
    const proc = spawn(this.python.command, [...this.python.args, '-X', 'utf8', '-u', this.runtimeScript], {
      cwd: this.cwd,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' }
    })
    this.proc = proc
    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')

    proc.stdout.on('data', (chunk: string) => {
      this.buffer += chunk
      let nl: number
      while ((nl = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, nl).trim()
        this.buffer = this.buffer.slice(nl + 1)
        if (!line) continue
        try {
          const msg = JSON.parse(line) as PyMessage
          if (msg && typeof msg.type === 'string') this.handlers.onMessage(msg)
        } catch {
          this.handlers.onMessage({ type: 'console', level: 'warn', text: `Saída inesperada do runtime: ${line.slice(0, 200)}` })
        }
      }
    })
    proc.stderr.on('data', (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-4000)
    })
    proc.stdin.on('error', () => {
      // Python já morreu: o `exit` avisa; escrever num pipe fechado não deve derrubar a IDE.
    })
    proc.on('error', (err) => {
      this.stderr += `\n${err.message}`
      this.finish(null)
    })
    proc.on('exit', (code) => this.finish(code))
  }

  private finish(code: number | null): void {
    if (this.exited) return
    this.exited = true
    this.handlers.onExit(code, this.stderr.trim())
  }

  send(msg: object): void {
    if (this.exited || !this.proc?.stdin.writable) return
    this.proc.stdin.write(JSON.stringify(msg) + '\n')
  }

  /** Pede o encerramento e, se o processo não sair logo (script preso num laço), o mata. */
  stop(): void {
    const proc = this.proc
    if (!proc || this.exited) return
    this.send({ type: 'shutdown' })
    proc.stdin.end()
    const timer = setTimeout(() => proc.kill(), 1500)
    proc.once('exit', () => clearTimeout(timer))
  }
}
