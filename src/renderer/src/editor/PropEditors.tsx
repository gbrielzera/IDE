import { useEffect, useRef, useState } from 'react'
import type { PropDef } from '../components/catalog'

/**
 * Editores de propriedade. Os de texto só gravam ao sair do campo ou apertar Enter (Esc cancela),
 * para cada edição virar UMA entrada no histórico de desfazer, e não uma por tecla.
 */

interface TextProps {
  value: string
  onCommit(value: string): void
  multiline?: boolean
  readOnly?: boolean
  testId?: string
  invalid?: boolean
  /** Chamado quando a pessoa volta a editar ou cancela (some com mensagens de erro antigas). */
  onEdit?: () => void
}

export function TextEditor({ value, onCommit, multiline, readOnly, testId, invalid, onEdit }: TextProps): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  const cancelled = useRef(false)
  useEffect(() => setDraft(value), [value]) // reflete desfazer/refazer e outras mudanças externas

  function finish(): void {
    if (cancelled.current) {
      cancelled.current = false
      setDraft(value)
      onEdit?.()
    } else if (draft !== value) onCommit(draft)
  }

  const shared = {
    value: draft,
    readOnly,
    'data-testid': testId,
    'aria-invalid': invalid || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => {
      setDraft(e.target.value)
      onEdit?.()
    },
    onBlur: finish,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        cancelled.current = true
        e.currentTarget.blur()
      } else if (e.key === 'Enter' && !multiline) e.currentTarget.blur()
    }
  }
  return multiline ? <textarea rows={3} {...shared} /> : <input type="text" {...shared} />
}

interface NumberProps {
  value: number
  onCommit(value: number): void
  min?: number
  max?: number
  testId?: string
}

export function NumberEditor({ value, onCommit, min, max, testId }: NumberProps): React.JSX.Element {
  const [draft, setDraft] = useState(String(value))
  const cancelled = useRef(false)
  useEffect(() => setDraft(String(value)), [value])

  function finish(): void {
    if (cancelled.current) cancelled.current = false
    else {
      const n = Math.round(Number(draft))
      if (draft.trim() !== '' && Number.isFinite(n)) {
        const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
        if (clamped !== value) onCommit(clamped)
        setDraft(String(clamped))
        return
      }
    }
    setDraft(String(value)) // vazio, inválido ou cancelado: volta ao valor atual
  }

  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      data-testid={testId}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        } else if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

export function BooleanEditor({
  value,
  onCommit,
  testId
}: {
  value: boolean
  onCommit(value: boolean): void
  testId?: string
}): React.JSX.Element {
  return <input type="checkbox" checked={value} data-testid={testId} onChange={(e) => onCommit(e.target.checked)} />
}

export function EnumEditor({
  value,
  options,
  onCommit,
  testId
}: {
  value: string
  options: readonly string[]
  onCommit(value: string): void
  testId?: string
}): React.JSX.Element {
  return (
    <select value={value} data-testid={testId} onChange={(e) => onCommit(e.target.value)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

let colorTxn = 0

/** Seletor de cor + campo hexadecimal; vazio = cor padrão do componente. */
export function ColorEditor({
  value,
  onCommit,
  testId
}: {
  value: string
  onCommit(value: string, txn?: string): void
  testId?: string
}): React.JSX.Element {
  // Arrastar no seletor dispara muitos eventos: eles viram uma só entrada no histórico.
  const txn = useRef('')
  return (
    <div className="color-editor">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'}
        data-testid={testId ? `${testId}-picker` : undefined}
        onFocus={() => (txn.current = `color-${++colorTxn}`)}
        onChange={(e) => onCommit(e.target.value, txn.current || undefined)}
      />
      <TextEditor
        value={value}
        testId={testId}
        onCommit={(v) => {
          const t = v.trim()
          if (t === '' || /^#[0-9a-f]{6}$/i.test(t)) onCommit(t.toLowerCase())
        }}
      />
      <button className="link" disabled={value === ''} onClick={() => onCommit('')} title="Voltar à cor padrão">
        limpar
      </button>
    </div>
  )
}

/** Lista de itens: um por linha. */
export function ItemsEditor({
  value,
  onCommit,
  testId
}: {
  value: string[]
  onCommit(value: string[]): void
  testId?: string
}): React.JSX.Element {
  return (
    <TextEditor
      multiline
      testId={testId}
      value={value.join('\n')}
      onCommit={(text) => onCommit(text.split('\n').filter((l) => l.trim() !== ''))}
    />
  )
}

/** Editor adequado ao tipo da propriedade. */
export function PropEditor({
  def,
  value,
  onCommit
}: {
  def: PropDef
  value: unknown
  onCommit(value: unknown, txn?: string): void
}): React.JSX.Element {
  const testId = `prop-${def.key}`
  switch (def.type) {
    case 'boolean':
      return <BooleanEditor value={value === true} onCommit={onCommit} testId={testId} />
    case 'number':
      return (
        <NumberEditor
          value={typeof value === 'number' ? value : Number(def.default)}
          min={def.min}
          max={def.max}
          onCommit={onCommit}
          testId={testId}
        />
      )
    case 'enum':
      return (
        <EnumEditor
          value={String(value ?? def.default)}
          options={def.options ?? []}
          onCommit={onCommit}
          testId={testId}
        />
      )
    case 'color':
      return <ColorEditor value={typeof value === 'string' ? value : ''} onCommit={onCommit} testId={testId} />
    case 'items':
      return (
        <ItemsEditor
          value={Array.isArray(value) ? value.map(String) : []}
          onCommit={onCommit}
          testId={testId}
        />
      )
    case 'text':
      return <TextEditor multiline value={String(value ?? '')} onCommit={onCommit} testId={testId} />
    default:
      return <TextEditor value={String(value ?? '')} onCommit={onCommit} testId={testId} />
  }
}
