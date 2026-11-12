import type { CSSProperties, ReactNode } from 'react'
import type { FormNode } from '@shared/project'
import { activeTab } from '../core/props'
import { formatNumber, percentOf } from './numeric'

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : []
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Fonte e cores do componente, repassadas ao CSS por variáveis (só as que foram alteradas). */
export function appearanceStyle(node: FormNode): CSSProperties {
  const p = node.props
  const vars: Record<string, string> = {}
  if (typeof p.fontSize === 'number') vars['--c-size'] = `${p.fontSize}px`
  if (p.bold === true) vars['--c-weight'] = '700'
  if (p.italic === true) vars['--c-style'] = 'italic'
  if (typeof p.color === 'string' && p.color) vars['--c-color'] = p.color
  if (typeof p.background === 'string' && p.background) vars['--c-bg'] = p.background
  return vars as CSSProperties
}

const JUSTIFY: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

/** Aparência estática do componente no canvas (a interação real vem do runtime, no M3). */
export function renderContent(node: FormNode): ReactNode {
  const p = node.props
  switch (node.type) {
    case 'Label':
      return (
        <div className="cmp cmp-label" style={{ justifyContent: JUSTIFY[str(p.align)] ?? 'flex-start' }}>
          {str(p.text)}
        </div>
      )
    case 'TextField':
      return (
        <div className="cmp cmp-input">
          {str(p.value) || <span className="cmp-placeholder">{str(p.placeholder)}</span>}
        </div>
      )
    case 'TextArea':
      return <div className="cmp cmp-input cmp-textarea">{str(p.value)}</div>
    case 'Button':
      return <div className="cmp cmp-button">{str(p.text)}</div>
    case 'CheckBox':
      return (
        <div className="cmp cmp-check">
          <span className={`cmp-box${p.checked ? ' on' : ''}`}>{p.checked ? '✓' : ''}</span>
          {str(p.text)}
        </div>
      )
    case 'RadioGroup':
      return (
        <div className="cmp cmp-radios">
          {strings(p.items).map((item, i) => (
            <div key={i} className="cmp-check">
              <span className={`cmp-radio${p.selectedIndex === i ? ' on' : ''}`} />
              {item}
            </div>
          ))}
        </div>
      )
    case 'ComboBox': {
      const i = typeof p.selectedIndex === 'number' ? p.selectedIndex : -1
      return (
        <div className="cmp cmp-input cmp-combo">
          <span>{strings(p.items)[i] ?? ''}</span>
          <span className="cmp-caret">▾</span>
        </div>
      )
    }
    case 'ListBox':
      return (
        <div className="cmp cmp-input cmp-list">
          {strings(p.items).map((item, i) => (
            <div key={i} className={`cmp-list-item${p.selectedIndex === i ? ' on' : ''}`}>
              {item}
            </div>
          ))}
        </div>
      )
    case 'Image':
      return <div className="cmp cmp-image">{str(p.source) || 'Imagem'}</div>
    case 'Panel':
      return <div className="cmp cmp-panel" />
    case 'Tabs': {
      const selected = activeTab(node)
      return (
        <div className="cmp cmp-tabs">
          <div className="cmp-tabbar">
            {strings(p.tabs).map((tab, i) => (
              <span key={i} className={`cmp-tab${selected === i ? ' on' : ''}`} data-tab-index={i}>
                {tab}
              </span>
            ))}
          </div>
          <div className="cmp-tabbody" />
        </div>
      )
    }
    case 'Table':
      return (
        <div className="cmp cmp-table">
          <div className="cmp-thead">
            {strings(p.columns).map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
        </div>
      )
    case 'NumericField':
      return (
        <div className="cmp cmp-input cmp-combo">
          <span>{formatNumber(p.value, p.decimals)}</span>
          <span className="cmp-caret">▴▾</span>
        </div>
      )
    case 'PasswordField':
      return (
        <div className="cmp cmp-input">
          {str(p.value) ? '•'.repeat(Math.min(str(p.value).length, 24)) : <span className="cmp-placeholder">{str(p.placeholder)}</span>}
        </div>
      )
    case 'DatePicker':
      return (
        <div className="cmp cmp-input cmp-combo">
          <span>{str(p.value) || <span className="cmp-placeholder">dd/mm/aaaa</span>}</span>
          <span className="cmp-caret">▦</span>
        </div>
      )
    case 'Slider':
      return (
        <div className="cmp cmp-slider">
          <div className="cmp-track">
            <div className="cmp-thumb" style={{ left: `${percentOf(p)}%` }} />
          </div>
          {p.showValue === true && <span className="cmp-slider-value">{String(p.value ?? '')}</span>}
        </div>
      )
    case 'ToggleSwitch':
      return (
        <div className="cmp cmp-check">
          <span className={`cmp-switch${p.checked ? ' on' : ''}`} />
          {str(p.text)}
        </div>
      )
    case 'ProgressBar':
      return (
        <div className="cmp cmp-progress">
          <div className="cmp-progress-fill" style={{ width: p.indeterminate === true ? '35%' : `${percentOf(p)}%` }} />
          {p.showLabel === true && p.indeterminate !== true && <span className="cmp-progress-label">{percentOf(p)}%</span>}
        </div>
      )
    case 'Alert':
      return (
        <div className={`cmp cmp-alert v-${str(p.variant) || 'info'}`}>
          {str(p.title) && <b>{str(p.title)}</b>}
          <span>{str(p.text)}</span>
        </div>
      )
    case 'Link':
      return <div className="cmp cmp-link">{str(p.text)}</div>
    case 'Card':
      return (
        <div className="cmp cmp-card">
          <div className="cmp-card-head">
            <b>{str(p.title)}</b>
            {str(p.subtitle) && <small>{str(p.subtitle)}</small>}
          </div>
        </div>
      )
    case 'GroupBox':
      return (
        <div className="cmp cmp-group">
          <span className="cmp-group-title">{str(p.title)}</span>
        </div>
      )
    default:
      return <div className="cmp cmp-unknown">? {node.type}</div>
  }
}
