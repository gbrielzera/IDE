import type { ReactNode } from 'react'
import type { FormNode } from '@shared/project'

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : []
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Aparência estática do componente no canvas (a interação real vem do runtime, no M3). */
export function renderContent(node: FormNode): ReactNode {
  const p = node.props
  switch (node.type) {
    case 'Label':
      return <div className="cmp cmp-label">{str(p.text)}</div>
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
    case 'Tabs':
      return (
        <div className="cmp cmp-tabs">
          <div className="cmp-tabbar">
            {strings(p.tabs).map((tab, i) => (
              <span key={i} className={`cmp-tab${p.selectedIndex === i ? ' on' : ''}`}>
                {tab}
              </span>
            ))}
          </div>
          <div className="cmp-tabbody" />
        </div>
      )
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
    default:
      return <div className="cmp cmp-unknown">? {node.type}</div>
  }
}
