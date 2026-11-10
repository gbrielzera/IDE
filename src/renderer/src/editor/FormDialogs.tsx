import { useEffect, useRef, useState } from 'react'
import { useIde } from '../store'

/** Janelas de "Nova tela" e de confirmação de "Remover tela". */
export function FormDialogs(): React.JSX.Element | null {
  const dialog = useIde((s) => s.formDialog)
  useEffect(() => {
    if (!dialog) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      useIde.getState().closeFormDialog()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dialog])

  if (!dialog) return null
  return (
    <div className="dict-backdrop" onPointerDown={() => useIde.getState().closeFormDialog()}>
      <div className="mini-dialog" role="dialog" data-testid="form-dialog" onPointerDown={(e) => e.stopPropagation()}>
        {dialog.kind === 'new' ? <NewForm /> : <RemoveForm name={dialog.name} />}
      </div>
    </div>
  )
}

function NewForm(): React.JSX.Element {
  const existing = useIde((s) => s.project?.manifest.forms.length ?? 0)
  const [name, setName] = useState(`Tela${existing + 1}`)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  function submit(): void {
    setError(useIde.getState().addForm(name))
  }

  return (
    <>
      <h3>Nova tela</h3>
      <p className="muted">O nome também é usado no código: app.open_form("{name.trim() || 'Nome'}").</p>
      <input
        ref={input}
        data-testid="new-form-name"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      {error && (
        <p className="field-error" role="alert" data-testid="form-dialog-error">
          {error}
        </p>
      )}
      <div className="dialog-buttons">
        <button onClick={submit} data-testid="new-form-ok">
          Criar
        </button>
        <button onClick={() => useIde.getState().closeFormDialog()}>Cancelar</button>
      </div>
    </>
  )
}

function RemoveForm({ name }: { name: string }): React.JSX.Element {
  const ref = useIde((s) => s.project?.manifest.forms.find((f) => f.name === name))
  return (
    <>
      <h3>Remover a tela "{name}"?</h3>
      <p>
        A tela sai do projeto. Os arquivos <b>{ref?.layout}</b> e <b>{ref?.script}</b> não são apagados: ao salvar, eles ganham o final{' '}
        <b>.removido</b> na pasta do projeto, e você pode recuperá-los tirando esse final.
      </p>
      <div className="dialog-buttons">
        <button onClick={() => useIde.getState().removeForm(name)} data-testid="remove-form-ok">
          Remover
        </button>
        <button onClick={() => useIde.getState().closeFormDialog()} autoFocus>
          Cancelar
        </button>
      </div>
    </>
  )
}
