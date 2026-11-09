import { useEffect, useRef, useState } from 'react'
import { useIde } from '../store'
import { modelFor, monaco, setLintMarkers, setRunMarkers, themeName } from './monacoSetup'

/** Acompanha a troca de tema claro/escuro da IDE. */
function useMonacoTheme(): string {
  const [name, setName] = useState(themeName())
  useEffect(() => {
    const observer = new MutationObserver(() => setName(themeName()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return name
}

/** O script Python do formulário, num editor Monaco. O texto mora na store; o Monaco guarda o histórico de desfazer. */
export default function CodeEditor({ formName }: { formName: string }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const modelRef = useRef<monaco.editor.ITextModel | null>(null)
  const projectDir = useIde((s) => s.project?.dir)
  const text = useIde((s) => s.scripts[formName] ?? '')
  const syncNonce = useIde((s) => s.scriptSync[formName] ?? 0)
  const doc = useIde((s) => s.tracked[formName]?.doc ?? null)
  const runErrors = useIde((s) => s.runErrors[formName])
  const reveal = useIde((s) => s.reveal)
  const theme = useMonacoTheme()

  // Cria o editor (e o modelo, na primeira vez) e devolve ao store cada alteração de texto.
  useEffect(() => {
    if (!host.current) return
    const model = modelFor(formName, useIde.getState().scripts[formName] ?? '')
    const editor = monaco.editor.create(host.current, {
      model,
      language: 'python',
      theme: themeName(),
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: "'Lucida Console', Consolas, monospace",
      fontSize: 13,
      tabSize: 4,
      insertSpaces: true,
      detectIndentation: false,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      lineNumbersMinChars: 3,
      padding: { top: 6 },
      quickSuggestions: { other: true, comments: false, strings: false }
    })
    editorRef.current = editor
    modelRef.current = model
    const subscription = model.onDidChangeContent(() => useIde.getState().setScript(formName, model.getValue()))
    return () => {
      subscription.dispose()
      editor.dispose()
      editorRef.current = null
      modelRef.current = null
    }
  }, [formName, projectDir])

  // Texto que mudou POR FORA do editor (handler criado pelo duplo clique, projeto reaberto...).
  // Só reage ao contador `scriptSync`, nunca ao texto: enquanto se digita, o Monaco é a fonte da verdade, e
  // copiar o texto da store a cada atualização devolveria um eco atrasado que apagaria as últimas teclas.
  useEffect(() => {
    const model = modelRef.current
    const external = useIde.getState().scripts[formName] ?? ''
    if (model && model.getValue() !== external) {
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text: external }], () => null)
      model.pushStackElement()
    }
  }, [syncNonce, formName, projectDir])

  useEffect(() => {
    monaco.editor.setTheme(theme)
  }, [theme])

  // Avisos de IDs inexistentes: reavaliados ao digitar e quando os componentes mudam.
  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    const timer = window.setTimeout(() => setLintMarkers(model, doc), 200)
    return () => window.clearTimeout(timer)
  }, [text, doc, formName, projectDir])

  useEffect(() => {
    const model = modelRef.current
    if (model) setRunMarkers(model, runErrors ?? [])
  }, [runErrors, text, formName, projectDir])

  // Levar o cursor a uma linha (duplo clique no componente, clique no erro do console).
  useEffect(() => {
    const editor = editorRef.current
    const model = modelRef.current
    if (!reveal || reveal.form !== formName || !editor || !model) return
    const line = Math.min(Math.max(1, reveal.line), model.getLineCount())
    editor.setPosition({ lineNumber: line, column: model.getLineMaxColumn(line) })
    editor.revealLineInCenter(line)
    editor.focus()
    useIde.getState().clearReveal()
  }, [reveal, formName, projectDir])

  return <div ref={host} className="code-host" data-testid="code-editor" />
}
