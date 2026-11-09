import { useEffect, useRef } from 'react'
import { useIde } from '../store'

export function ConsolePanel(): React.JSX.Element {
  const lines = useIde((s) => s.console)
  const clear = useIde((s) => s.clearConsole)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines])

  return (
    <section className="pane">
      <h2 className="pane-title">
        Console
        <button className="link" onClick={clear}>
          limpar
        </button>
      </h2>
      <div className="pane-body console">
        {lines.map((l) => {
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
        })}
        <div ref={endRef} />
      </div>
    </section>
  )
}
