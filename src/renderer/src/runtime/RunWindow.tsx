import { createContext, useCallback, useContext, useEffect, useReducer, useState } from 'react'
import type { FormNode } from '@shared/project'
import type { RunChange, RunComponent, RunInit } from '@shared/run'
import { childBoxStyle, childrenLayerStyle } from '../components/layoutStyle'
import { appearanceStyle } from '../components/render'
import { activeTab, layoutOf } from '../core/props'
import { ALERT_ICON, clamp, formatNumber, num, percentOf, rangeOf, safeUrl, toggleText } from '../components/numeric'
import { insetTop } from '../core/tree'

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
    case 'NumericField': {
      const { min, max } = rangeOf(p)
      const step = num(p.step, 1) > 0 ? num(p.step, 1) : 1
      const set = (raw: number): void => {
        const d = clamp(Math.round(num(p.decimals, 0)), 0, 6)
        const value = Number(clamp(raw, min, max).toFixed(d))
        if (value !== p.value) change(id, 'value', value, { name: 'change', args: { value } })
      }
      return (
        <div className={`r-affixed${p.showSpinner === false ? ' no-spinner' : ''}`}>
          {str(p.prefix) && <span className="r-affix">{str(p.prefix)}</span>}
          <NumberInput
            text={formatNumber(p.value, p.decimals)}
            min={min}
            max={max}
            step={step}
            placeholder={str(p.placeholder)}
            disabled={disabled}
            readOnly={p.readOnly === true}
            onCommit={set}
          />
          {str(p.suffix) && <span className="r-affix">{str(p.suffix)}</span>}
        </div>
      )
    }
    case 'PasswordField': {
      const limit = Math.round(num(p.maxLength, 0))
      return (
        <div className="r-password">
          <input
            className="r-input"
            type={p.revealed === true ? 'text' : 'password'}
            value={str(p.value)}
            placeholder={str(p.placeholder)}
            maxLength={limit > 0 ? limit : undefined}
            readOnly={p.readOnly === true}
            disabled={disabled}
            autoComplete="off"
            onChange={(e) => change(id, 'value', e.target.value, { name: 'change', args: {} })}
          />
          {p.showToggle === true && (
            <button className="r-button r-eye" disabled={disabled} title={p.revealed === true ? 'Esconder' : 'Mostrar'} onClick={() => change(id, 'revealed', p.revealed !== true)}>
              {p.revealed === true ? '🙈' : '👁'}
            </button>
          )}
        </div>
      )
    }
    case 'DatePicker': {
      const setDate = (value: string): void => {
        if (value !== str(p.value)) change(id, 'value', value, { name: 'change', args: { value } })
      }
      return (
        <div className="r-password">
          <input
            className="r-input"
            type="date"
            value={str(p.value)}
            min={str(p.minDate) || undefined}
            max={str(p.maxDate) || undefined}
            disabled={disabled}
            onChange={(e) => setDate(e.target.value)}
          />
          {p.showTodayButton === true && (
            <button className="r-button r-mini" disabled={disabled} onClick={() => setDate(new Date().toLocaleDateString('sv-SE'))}>
              Hoje
            </button>
          )}
          {p.allowClear === true && (
            <button className="r-button r-eye" disabled={disabled || str(p.value) === ''} title="Limpar a data" onClick={() => setDate('')}>
              ×
            </button>
          )}
        </div>
      )
    }
    case 'Slider': {
      const { min, max } = rangeOf(p)
      const release = (): void => fire(id, 'release', { value: num(p.value) })
      return (
        <div className={`r-slider${p.orientation === 'vertical' ? ' vertical' : ''}`}>
          <input
            type="range"
            min={min}
            max={max}
            step={num(p.step, 1) > 0 ? num(p.step, 1) : 1}
            value={clamp(num(p.value), min, max)}
            disabled={disabled}
            onChange={(e) => {
              const value = Number(e.target.value)
              change(id, 'value', value, { name: 'change', args: { value } })
            }}
            onPointerUp={release}
            onKeyUp={(e) => /^(Arrow|Page|Home|End)/.test(e.key) && release()}
          />
          {p.showValue === true && <span className="r-slider-value">{String(p.value ?? '')}</span>}
        </div>
      )
    }
    case 'ToggleSwitch':
      return (
        <label className={`r-check r-toggle${p.labelPosition === 'left' ? ' label-left' : ''}`}>
          <input
            type="checkbox"
            role="switch"
            checked={p.checked === true}
            disabled={disabled}
            onChange={(e) => change(id, 'checked', e.target.checked, { name: 'change', args: { checked: e.target.checked } })}
          />
          <span className={`r-switch${p.checked === true ? ' on' : ''}`} />
          <span className="r-toggle-text">
            {toggleText(p)}
            {str(p.description) && <small>{str(p.description)}</small>}
          </span>
        </label>
      )
    case 'ProgressBar': {
      const vertical = p.orientation === 'vertical'
      const size = `${percentOf(p)}%`
      return (
        <div
          className={`r-progress${p.indeterminate === true ? ' indeterminate' : ''}${vertical ? ' vertical' : ''}`}
          role="progressbar"
          aria-orientation={vertical ? 'vertical' : 'horizontal'}
          aria-valuemin={rangeOf(p).min}
          aria-valuemax={rangeOf(p).max}
          aria-valuenow={p.indeterminate === true ? undefined : clamp(num(p.value), rangeOf(p).min, rangeOf(p).max)}
          onClick={click}
        >
          <div className="r-progress-fill" style={p.indeterminate === true ? undefined : vertical ? { height: size } : { width: size }} />
          {p.showLabel === true && p.indeterminate !== true && <span className="r-progress-label">{percentOf(p)}%</span>}
        </div>
      )
    }
    case 'Alert':
      return (
        <div className={`r-alert v-${str(p.variant) || 'info'}`} role="alert" onClick={click}>
          {p.showIcon !== false && <span className="r-alert-icon">{ALERT_ICON[str(p.variant)] ?? ALERT_ICON.info}</span>}
          <span className="r-alert-body">
            {str(p.title) && <b>{str(p.title)}</b>}
            <span>{str(p.text)}</span>
          </span>
          {p.dismissible === true && (
            <button
              className="r-alert-close"
              aria-label="Fechar o aviso"
              onClick={(e) => {
                e.stopPropagation()
                change(id, 'visible', false, { name: 'dismiss', args: {} })
              }}
            >
              ×
            </button>
          )}
        </div>
      )
    case 'Link':
      return (
        <a
          className={`r-link${disabled ? ' is-disabled' : ''}${p.underline === false ? ' no-underline' : ''}`}
          href={safeUrl(p.url) ?? '#'}
          tabIndex={disabled ? -1 : 0}
          onClick={(e) => {
            e.preventDefault() // quem abre é o processo principal, depois de validar o endereço
            e.stopPropagation()
            if (disabled) return
            if (str(p.url)) window.vform.run.openUrl(str(p.url))
            fire(id, 'click')
          }}
        >
          {str(p.text)}
        </a>
      )
    case 'Card':
    case 'GroupBox': {
      const collapsed = p.collapsed === true
      const chevron = p.collapsible === true && (
        <button
          className="r-chevron"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expandir' : 'Recolher'}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            change(id, 'collapsed', !collapsed, { name: collapsed ? 'expand' : 'collapse', args: {} })
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      )
      if (node.type === 'GroupBox')
        return (
          <div className={`r-group${p.border === false ? ' no-border' : ''}${collapsed ? ' collapsed' : ''}`} onClick={click}>
            <span className="r-group-title">
              {chevron}
              {str(p.title)}
            </span>
          </div>
        )
      return (
        <div className={`r-card${p.border === false ? ' no-border' : ''}${p.shadow === false ? ' no-shadow' : ''}${collapsed ? ' collapsed' : ''}`} onClick={click}>
          <div className="r-card-head">
            <span className="r-card-titles">
              <b>{str(p.title)}</b>
              {str(p.subtitle) && <small>{str(p.subtitle)}</small>}
            </span>
            {chevron}
          </div>
        </div>
      )
    }
    default:
      return <div className="r-unknown">? {node.type}</div>
  }
}

/**
 * Campo numérico: o texto fica livre enquanto se digita (dá para apagar e escrever "-") e só vira número,
 * já dentro da faixa, ao sair do campo, apertar Enter ou usar as setinhas.
 */
function NumberInput(props: { text: string; min: number; max: number; step: number; placeholder?: string; disabled: boolean; readOnly: boolean; onCommit(value: number): void }): React.JSX.Element {
  const [text, setText] = useState(props.text)
  useEffect(() => setText(props.text), [props.text]) // o valor mudou por fora (script, setinhas): mostra o novo
  const commit = (raw: string): void => {
    const value = Number(raw.replace(',', '.'))
    if (raw.trim() === '' || !Number.isFinite(value)) setText(props.text)
    else {
      props.onCommit(value)
      setText(props.text) // se o valor ajustado for o mesmo de antes (ex.: abaixo do mínimo), o campo volta a mostrá-lo
    }
  }
  return (
    <input
      className="r-input r-number"
      type="number"
      inputMode="decimal"
      value={text}
      min={props.min}
      max={props.max}
      step={props.step}
      placeholder={props.placeholder || undefined}
      disabled={props.disabled}
      readOnly={props.readOnly}
      onChange={(e) => {
        setText(e.target.value)
        // Setinhas e roda do mouse mudam o valor sem o campo "sair": confirma na hora.
        const native = e.nativeEvent as InputEvent
        if (native.inputType === undefined || native.inputType === 'insertReplacementText') commit(e.target.value)
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
    />
  )
}

function RunNode({ node, parent }: { node: FormNode; parent: FormNode | null }): React.JSX.Element | null {
  const { state } = useContext(RunContext)
  const p = state[node.id]
  if (!p) return null
  // Os componentes enxergam o estado atual (não o do arquivo): é ele que muda em execução.
  const self: FormNode = { ...node, props: p }
  const parentState = parent ? state[parent.id] : undefined
  const parentLayout = parent && parentState ? layoutOf({ ...parent, props: parentState }) : null
  // Card/GroupBox recolhido: sobra só o cabeçalho e o conteúdo some.
  const collapsed = p.collapsed === true && insetTop(node) > 0
  const box = {
    x: Number(p.x ?? node.x),
    y: Number(p.y ?? node.y),
    width: Number(p.width ?? node.width),
    height: collapsed ? insetTop(node) : Number(p.height ?? node.height)
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
      {node.children && !collapsed && (
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
