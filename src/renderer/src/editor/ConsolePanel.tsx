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
        {lines.map((l) => (
          <div key={l.id} className={`console-line ${l.level}`}>
            <span className="console-time">{l.time}</span>
            {l.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  )
}
