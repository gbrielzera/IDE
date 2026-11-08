import { useIde } from '../store'

export function StatusBar(): React.JSX.Element {
  const dir = useIde((s) => s.project?.dir)
  const dirty = useIde((s) => s.dirty)

  return (
    <footer className="statusbar">
      <span>{dir ?? 'Nenhum projeto aberto'}</span>
      {dir && <span>{dirty ? '● não salvo' : 'salvo'}</span>}
    </footer>
  )
}
