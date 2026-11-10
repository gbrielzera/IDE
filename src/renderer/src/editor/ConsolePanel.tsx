import { useEffect, useRef, useState } from 'react'
import { useIde, type LogEntry, type LogLevel } from '../store'

type Tab = 'console' | 'logs'
type Filter = 'all' | LogLevel

const LEVEL_LABEL: Record<LogLevel, string> = { info: 'INFO', warn: 'AVISO', error: 'ERRO' }
const FILTERS: Array<[Filter, string]> = [
  ['all', 'Tudo'],
  ['error', 'Erros'],
  ['warn', 'Avisos'],
  ['info', 'Info']
]

export function formatLogTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour12: false })}`
}

export function ConsolePanel(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('console')
  const lines = useIde((s) => s.console)
  const logs = useIde((s) => s.logs)
  const clearConsole = useIde((s) => s.clearConsole)
  const clearLogs = useIde((s) => s.clearLogs)
  const [filter, setFilter] = useState<Filter>('all')
  const endRef = useRef<HTMLDivElement>(null)

  const shown: LogEntry[] = filter === 'all' ? logs : logs.filter((l) => l.level === filter)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines, shown.length, tab])

  return (
    <section className="pane">
      <h2 className="pane-title">
        <span className="tabs-mini">
          <button className={tab === 'console' ? 'on' : ''} data-testid="tab-console" onClick={() => setTab('console')}>
            Console
          </button>
          <button className={tab === 'logs' ? 'on' : ''} data-testid="tab-logs" onClick={() => setTab('logs')}>
            Logs{logs.some((l) => l.level === 'error') ? ' •' : ''}
          </button>
        </span>
        {tab === 'logs' && (
          <span className="log-filters">
            {FILTERS.map(([key, label]) => (
              <button key={key} className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </span>
        )}
        <button className="link" onClick={tab === 'console' ? clearConsole : clearLogs}>
          limpar
        </button>
      </h2>
      <div className={`pane-body console${tab === 'logs' ? ' logs' : ''}`} data-testid={tab === 'logs' ? 'logs-list' : undefined}>
        {tab === 'console'
          ? lines.map((l) => {
              const link = l.line !== undefined && l.file !== undefined
              return (
                <div
                  key={l.id}
                  className={`console-line ${l.level}${link ? ' clickable' : ''}`}
                  title={link ? `Ir para a linha ${l.line} de ${l.file}` : undefined}
                  onClick={link ? () => useIde.getState().goToScript(l.file!, l.line!) : undefined}
                >
                  <span className="console-time">{l.time}</span>
                  {l.text}
                </div>
              )
            })
          : shown.map((l) => {
              const link = l.line !== undefined && l.file !== undefined
              return (
                <div
                  key={l.id}
                  className={`log-line ${l.level}${link ? ' clickable' : ''}`}
                  title={link ? `Ir para a linha ${l.line} de ${l.file}` : undefined}
                  onClick={link ? () => useIde.getState().goToScript(l.file!, l.line!) : undefined}
                >
                  <span className="console-time">{formatLogTime(l.at)}</span>
                  <span className="log-level">{LEVEL_LABEL[l.level]}</span>
                  <span className="log-run">{l.run === null ? '—' : `exec. ${l.run}`}</span>
                  {l.text}
                  {link && <span className="log-where"> ({l.file}:{l.line})</span>}
                </div>
              )
            })}
        <div ref={endRef} />
      </div>
    </section>
  )
}
