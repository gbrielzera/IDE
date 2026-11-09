// Configuração única do Monaco: workers, temas, autocompletar da API do VForm e marcadores.
import * as monaco from '@monaco/editor/editor.api.js'
import '@monaco/languages/definitions/python/register.js'
import EditorWorker from '@monaco/editor/editor.worker.js?worker'
import './monacoFeatures'
import { lintScript } from '../core/lint'
import { completionsFor, type MemberKind } from '../core/pyapi'
import { useIde, type RunError } from '../store'

// O Monaco pede um worker por idioma; só o do editor é necessário (Python usa só realce de sintaxe).
;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker()
}

monaco.editor.defineTheme('vform-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#fdfdfb',
    'editor.lineHighlightBackground': '#f0efea',
    'editorLineNumber.foreground': '#a9a89f',
    'editorGutter.background': '#f6f5f1'
  }
})

monaco.editor.defineTheme('vform-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#2a2a27',
    'editor.lineHighlightBackground': '#31312e',
    'editorLineNumber.foreground': '#8b8a82',
    'editorGutter.background': '#262624'
  }
})

export function themeName(): 'vform-light' | 'vform-dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'vform-dark' : 'vform-light'
}

// ---------- Um modelo (texto + histórico de desfazer) por formulário ----------

const models = new Map<string, monaco.editor.ITextModel>()

function uriFor(form: string): monaco.Uri {
  return monaco.Uri.parse(`inmemory://vform/${encodeURIComponent(form)}.py`)
}

export function formOfModel(model: monaco.editor.ITextModel): string {
  return decodeURIComponent(model.uri.path.replace(/^\//, '').replace(/\.py$/, ''))
}

/** O modelo do script do formulário (criado na primeira vez; reaproveitado ao trocar de aba). */
export function modelFor(form: string, initial: string): monaco.editor.ITextModel {
  const uri = uriFor(form)
  const existing = monaco.editor.getModel(uri)
  if (existing) {
    models.set(form, existing)
    return existing
  }
  const model = monaco.editor.createModel(initial, 'python', uri)
  models.set(form, model)
  return model
}

// Ao trocar de projeto os textos antigos não valem: descarta os modelos.
let lastDir = useIde.getState().project?.dir
useIde.subscribe((s) => {
  const dir = s.project?.dir
  if (dir === lastDir) return
  lastDir = dir
  models.forEach((m) => m.dispose())
  models.clear()
})

// ---------- Autocompletar: form.<id>.<membro> e app.<membro> ----------

const KIND: Record<MemberKind, monaco.languages.CompletionItemKind> = {
  component: monaco.languages.CompletionItemKind.Field,
  property: monaco.languages.CompletionItemKind.Property,
  method: monaco.languages.CompletionItemKind.Method,
  event: monaco.languages.CompletionItemKind.Event
}
const SORT: Record<MemberKind, string> = { component: '0', property: '1', event: '2', method: '3' }

monaco.languages.registerCompletionItemProvider('python', {
  triggerCharacters: ['.'],
  provideCompletionItems(model, position) {
    const prefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
    const doc = useIde.getState().tracked[formOfModel(model)]?.doc ?? null
    const members = completionsFor(prefix, doc)
    if (!members) return { suggestions: [] }
    const word = model.getWordUntilPosition(position)
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn
    }
    return {
      suggestions: members.map((m) => ({
        label: m.name,
        kind: KIND[m.kind],
        detail: m.detail,
        documentation: m.doc,
        insertText: m.insert ?? m.name,
        insertTextRules: m.insert?.includes('$')
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        sortText: SORT[m.kind] + m.name,
        range
      }))
    }
  }
})

// ---------- Marcadores ----------

/** Avisos de IDs/propriedades inexistentes (verificação do script contra o formulário). */
export function setLintMarkers(model: monaco.editor.ITextModel, doc: Parameters<typeof lintScript>[1]): void {
  const markers = lintScript(model.getValue(), doc).map((d) => ({
    severity: monaco.MarkerSeverity.Warning,
    message: d.message,
    startLineNumber: d.line,
    endLineNumber: d.line,
    startColumn: d.startColumn,
    endColumn: d.endColumn
  }))
  monaco.editor.setModelMarkers(model, 'vform-lint', markers)
}

/** Erros da última execução, na linha onde aconteceram. */
export function setRunMarkers(model: monaco.editor.ITextModel, errors: RunError[]): void {
  const last = model.getLineCount()
  const markers = errors.map((e) => {
    const line = Math.min(Math.max(1, e.line), last)
    return {
      severity: monaco.MarkerSeverity.Error,
      message: e.message,
      startLineNumber: line,
      endLineNumber: line,
      startColumn: model.getLineFirstNonWhitespaceColumn(line) || 1,
      endColumn: model.getLineMaxColumn(line)
    }
  })
  monaco.editor.setModelMarkers(model, 'vform-run', markers)
}

export { monaco }
