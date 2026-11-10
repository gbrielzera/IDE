import { execFile, execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { LineSplitter, MAX_MESSAGE_CHARS } from './protocol'

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
  private readonly lines = new LineSplitter()
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
      const { lines, dropped, overflow } = this.lines.push(chunk)
      if (dropped > 0)
        this.handlers.onMessage({ type: 'console', level: 'warn', text: `${dropped} mensagem(ns) do runtime passaram do limite de ${MAX_MESSAGE_CHARS} caracteres e foram descartadas.` })
      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as PyMessage
          if (msg && typeof msg.type === 'string') this.handlers.onMessage(msg)
        } catch {
          this.handlers.onMessage({ type: 'console', level: 'warn', text: `Saída inesperada do runtime: ${line.slice(0, 200)}` })
        }
      }
      if (overflow) {
        this.stderr += '\nO runtime enviou dados demais sem terminar uma mensagem; o processo foi encerrado.'
        this.kill()
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
    const text = JSON.stringify(msg)
    if (text.length > MAX_MESSAGE_CHARS) {
      this.handlers.onMessage({ type: 'console', level: 'error', text: `Mensagem para o Python grande demais (${text.length} caracteres); não foi enviada.` })
      return
    }
    this.proc.stdin.write(text + '\n')
  }

  /**
   * Mata o processo e os filhos dele. No Windows o lançador `py` abre o Python como processo filho: matar só o
   * lançador deixaria o Python rodando (um laço infinito continuaria gastando CPU depois de "Parar").
   */
  kill(): void {
    const proc = this.proc
    if (!proc || proc.pid === undefined) return
    if (process.platform === 'win32') {
      try {
        // Síncrono de propósito: ao sair da IDE o processo principal não pode terminar antes de o Python morrer.
        execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true, timeout: 5000, stdio: 'ignore' })
      } catch {
        proc.kill() // taskkill falhou (o processo já tinha saído, por exemplo)
      }
    } else proc.kill('SIGKILL')
  }

  /** Pede o encerramento e, se o processo não sair logo (script preso num laço), o mata. */
  stop(force = false): void {
    const proc = this.proc
    if (!proc || this.exited) return
    if (force) return this.kill() // travado: não adianta pedir com educação
    this.send({ type: 'shutdown' })
    proc.stdin.end()
    const timer = setTimeout(() => this.kill(), 1500)
    proc.once('exit', () => clearTimeout(timer))
  }
}
