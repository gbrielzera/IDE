import { createContext, useCallback, useContext, useEffect, useReducer, useState } from 'react'
import type { FormNode } from '@shared/project'
import type { RunChange, RunComponent, RunInit } from '@shared/run'
import { childBoxStyle, childrenLayerStyle } from '../components/layoutStyle'
import { appearanceStyle } from '../components/render'
import { activeTab, layoutOf } from '../core/props'

/** Propriedades atuais de cada componente: o "espelho" que a janela mostra. */
type RunState = Record<string, Record<string, unknown>>

type Action = { type: 'init'; components: Record<string, RunComponent> } | { type: 'set'; changes: RunChange[] }

function reducer(state: RunState, action: Action): RunState {
  if (action.type === 'init') return Object.fromEntries(Object.entries(action.components).map(([id, c]) => [id, c.props]))
  const next = { ...state }
  for (const { id, prop, value } of action.changes) {
    const current = next[id]
    if (current) next[id] = { ...current, [prop]: value }
  }
  return next
}

interface Ctx {
  state: RunState
  /** O usuário mexeu num componente: atualiza a tela, avisa o Python (sync) e dispara o evento. */
  change(id: string, prop: string, value: unknown, event?: { name: string; args?: Record<string, unknown> }): void
  fire(id: string, name: string, args?: Record<string, unknown>): void
}

const RunContext = createContext<Ctx>(null as unknown as Ctx)

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const JUSTIFY: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

function Control({ node, p }: { node: FormNode; p: Record<string, unknown> }): React.JSX.Element | null {
  const { change, fire } = useContext(RunContext)
  const id = node.id
  const disabled = p.enabled === false
  const items = strings(p.items)
  const selected = typeof p.selectedIndex === 'number' && p.selectedIndex >= 0 && p.selectedIndex < items.length ? p.selectedIndex : -1
  const click = (e: React.MouseEvent): void => {
    e.stopPropagation() // o clique é só do componente em que se clicou, não dos pais
    fire(id, 'click')
  }

  switch (node.type) {
    case 'Label':
      return (
        <div className="r-label" style={{ justifyContent: JUSTIFY[str(p.align)] ?? 'flex-start' }} onClick={click}>
          {str(p.text)}
        </div>
      )
    case 'Button':
      return (
        <button className="r-button" disabled={disabled} onClick={click}>
          {str(p.text)}
        </button>
      )
    case 'TextField':
      return (
        <input
          className="r-input"
          type="text"
          value={str(p.value)}
          placeholder={str(p.placeholder)}
          readOnly={p.readOnly === true}
          disabled={disabled}
          onChange={(e) => change(id, 'value', e.target.value, { name: 'change', args: { value: e.target.value } })}
        />
      )
    case 'TextArea':
      return (
        <textarea
          className="r-input r-textarea"
          value={str(p.value)}
          readOnly={p.readOnly === true}
          disabled={disabled}
          onChange={(e) => change(id, 'value', e.target.value, { name: 'change', args: { value: e.target.value } })}
        />
      )
    case 'CheckBox':
      return (
        <label className="r-check">
          <input
            type="checkbox"
            checked={p.checked === true}
            disabled={disabled}
            onChange={(e) => change(id, 'checked', e.target.checked, { name: 'change', args: { checked: e.target.checked } })}
          />
          {str(p.text)}
        </label>
      )
    case 'RadioGroup':
      return (
        <div className="r-radios">
          {items.map((item, i) => (
            <label key={i} className="r-check">
              <input
                type="radio"
                name={`radio-${id}`}
                checked={selected === i}
                disabled={disabled}
                onChange={() => change(id, 'selectedIndex', i, { name: 'change', args: { index: i, value: item } })}
              />
              {item}
            </label>
          ))}
        </div>
      )
    case 'ComboBox':
      return (
        <select
          className="r-input r-combo"
          value={String(selected)}
          disabled={disabled}
          onChange={(e) => {
            const i = Number(e.target.value)
            change(id, 'selectedIndex', i, { name: 'change', args: { index: i, value: items[i] } })
          }}
        >
          {selected === -1 && <option value="-1" />}
          {items.map((item, i) => (
            <option key={i} value={i}>
              {item}
            </option>
          ))}
        </select>
      )
    case 'ListBox':
      return (
        <div className={`r-input r-list${disabled ? ' is-disabled' : ''}`}>
          {items.map((item, i) => (
            <div
              key={i}
              className={`r-list-item${selected === i ? ' on' : ''}`}
              onClick={() => !disabled && change(id, 'selectedIndex', i, { name: 'change', args: { index: i, value: item } })}
              onDoubleClick={() => !disabled && fire(id, 'double_click', { index: i, value: item })}
            >
              {item}
            </div>
          ))}
        </div>
      )
    case 'Image':
      return (
        <div className="r-image" onClick={click}>
          {str(p.source) || 'Imagem'}
        </div>
      )
    case 'Panel':
      return <div className="r-panel" onClick={click} />
    case 'Tabs': {
      const tabs = strings(p.tabs)
      const active = activeTab({ ...node, props: p })
      return (
        <div className="r-tabs">
          <div className="r-tabbar">
            {tabs.map((tab, i) => (
              <button
                key={i}
                className={`r-tab${active === i ? ' on' : ''}`}
                disabled={disabled}
                onClick={() => change(id, 'selectedIndex', i, { name: 'change', args: { index: i, value: tab } })}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="r-tabbody" />
        </div>
      )
    }
    case 'Table': {
      const rows = Array.isArray(p.rows) ? (p.rows as unknown[]) : []
      const sel = typeof p.selectedIndex === 'number' ? p.selectedIndex : -1
      return (
        <div className="r-input r-table">
          <table>
            <thead>
              <tr>
                {strings(p.columns).map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className={sel === i ? 'on' : undefined}
                  onClick={() => change(id, 'selectedIndex', i, { name: 'change', args: { index: i } })}
                >
                  {(Array.isArray(row) ? row : [row]).map((cell, j) => (
                    <td key={j}>{str(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    default:
      return <div className="r-unknown">? {node.type}</div>
  }
}

function RunNode({ node, parent }: { node: FormNode; parent: FormNode | null }): React.JSX.Element | null {
  const { state } = useContext(RunContext)
  const p = state[node.id]
  if (!p) return null
  // Os componentes enxergam o estado atual (não o do arquivo): é ele que muda em execução.
  const self: FormNode = { ...node, props: p }
  const parentState = parent ? state[parent.id] : undefined
  const parentLayout = parent && parentState ? layoutOf({ ...parent, props: parentState }) : null
  const box = {
    x: Number(p.x ?? node.x),
    y: Number(p.y ?? node.y),
    width: Number(p.width ?? node.width),
    height: Number(p.height ?? node.height)
  }
  const style = { ...childBoxStyle(box, parentLayout), ...(p.visible === false ? { display: 'none' } : {}) }
  const children =
    node.type === 'Tabs'
      ? (node.children ?? []).filter((c) => (c.tab ?? 0) === activeTab(self))
      : (node.children ?? [])

  return (
    <div className="run-node" data-run-id={node.id} style={style} title={typeof p.tooltip === 'string' && p.tooltip ? p.tooltip : undefined}>
      <div className="run-ctl" style={appearanceStyle(self)}>
        <Control node={node} p={p} />
      </div>
      {node.children && (
        <div className="run-children" style={childrenLayerStyle(self)}>
          {children.map((child) => (
            <RunNode key={child.id} node={child} parent={self} />
          ))}
        </div>
      )}
    </div>
  )
}

/** A janela que mostra o formulário funcionando (aberta pelo F5 da IDE). */
export function RunApp(): React.JSX.Element {
  const [init, setInit] = useState<RunInit | null>(null)
  const [missing, setMissing] = useState(false)
  const [state, dispatch] = useReducer(reducer, {})

  useEffect(() => {
    const api = window.vform.run
    let alive = true
    const off = api.onMessage((msg) => {
      if (msg.type === 'command') {
        // focus()/blur() do script: acha o controle real do componente e leva (ou tira) o foco.
        const root = document.querySelector(`[data-run-id="${CSS.escape(msg.id)}"]`)
        const el = root?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), button:not([disabled]), select:not([disabled]), [tabindex]')
        if (msg.name === 'focus') el?.focus()
        else (document.activeElement instanceof HTMLElement && root?.contains(document.activeElement) ? document.activeElement : el)?.blur()
        return
      }
      if (msg.type !== 'patch') return
      for (const c of msg.changes) if (c.id === ':form' && c.prop === 'title') document.title = String(c.value)
      dispatch({ type: 'set', changes: msg.changes })
    })
    const boot = (): void => {
      void api.init().then((data) => {
        if (!alive) return
        if (!data) return setMissing(true)
        document.title = data.doc.title
        dispatch({ type: 'init', components: data.components })
        setInit(data)
        api.ready() // só agora o Python carrega o script: os patches dele já têm onde ser aplicados
      })
    }
    boot()
    // Pré-visualização ao vivo: a IDE trocou o formulário/script; recomeça com os dados novos.
    const offReload = api.onReload(boot)
    return () => {
      alive = false
      off()
      offReload()
    }
  }, [])

  const fire = useCallback((id: string, name: string, args?: Record<string, unknown>) => {
    window.vform.run.send({ type: 'event', id, name, args })
  }, [])

  const change = useCallback<Ctx['change']>((id, prop, value, event) => {
    dispatch({ type: 'set', changes: [{ id, prop, value }] })
    window.vform.run.send({ type: 'sync', id, prop, value }) // antes do evento: o handler já vê o valor novo
    if (event) window.vform.run.send({ type: 'event', id, name: event.name, args: event.args })
  }, [])

  if (missing) return <p className="run-error">Esta janela não tem uma execução associada.</p>
  if (!init) return <div className="run-viewport" />

  return (
    <RunContext.Provider value={{ state, change, fire }}>
      <div className="run-viewport">
        <div className="run-root" style={{ width: init.doc.width, height: init.doc.height }}>
          {init.doc.children.map((node) => (
            <RunNode key={node.id} node={node} parent={null} />
          ))}
        </div>
      </div>
    </RunContext.Provider>
  )
}
