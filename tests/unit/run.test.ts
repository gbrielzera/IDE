import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newFormDocument, type FormDocument } from '@shared/project'
import type { RunStartResult } from '@shared/run'
import { addNode, createNode, setProp } from '@renderer/core/commands'
import { createTracked, mutate } from '@renderer/core/history'
import { idProblem } from '@renderer/core/ids'
import { buildRunComponents } from '@renderer/core/runstate'
import { useIde } from '@renderer/store'

const edit = (doc: FormDocument, recipe: (d: FormDocument) => void): FormDocument => mutate(createTracked(doc), recipe).doc

function sampleDoc(): FormDocument {
  let doc = newFormDocument('Main')
  doc = edit(doc, (d) => addNode(d, null, createNode(d, 'TextField', 10, 20)!))
  doc = edit(doc, (d) => addNode(d, null, createNode(d, 'Tabs', 0, 100)!))
  doc = edit(doc, (d) => addNode(d, 'tabs1', createNode(d, 'Label', 4, 4)!))
  doc = edit(doc, (d) => addNode(d, null, createNode(d, 'Table', 0, 300)!))
  return edit(doc, (d) => setProp(d, 'textField1', 'fontSize', 18))
}

describe('buildRunComponents', () => {
  it('inclui todos os componentes (também os aninhados), com tipo e geometria', () => {
    const c = buildRunComponents(sampleDoc())
    expect(Object.keys(c).sort()).toEqual(['label1', 'table1', 'tabs1', 'textField1'])
    expect(c.textField1.type).toBe('TextField')
    expect(c.textField1.props).toMatchObject({ x: 10, y: 20, width: 160, height: 28 })
  })

  it('preenche os padrões do schema (o arquivo só grava o que difere) e respeita o que foi alterado', () => {
    const { textField1 } = buildRunComponents(sampleDoc())
    expect(textField1.props).toMatchObject({
      value: '',
      placeholder: '',
      readOnly: false,
      enabled: true,
      visible: true,
      bold: false,
      fontSize: 18 // o valor do arquivo vence o padrão (12)
    })
  })

  it('acrescenta as propriedades que só existem em execução (linhas da Table)', () => {
    const { table1, tabs1 } = buildRunComponents(sampleDoc())
    expect(table1.props).toMatchObject({ columns: ['Coluna 1', 'Coluna 2', 'Coluna 3'], rows: [], selectedIndex: -1 })
    expect(tabs1.props).toMatchObject({ tabs: ['Aba 1', 'Aba 2'], selectedIndex: 0 })
    expect('rows' in tabs1.props).toBe(false)
  })

  it('devolve cópias: alterar o resultado não mexe no documento', () => {
    const doc = sampleDoc()
    const c = buildRunComponents(doc)
    ;(c.tabs1.props.tabs as string[]).push('X')
    expect(buildRunComponents(doc).tabs1.props.tabs).toEqual(['Aba 1', 'Aba 2'])
  })
})

describe('ids reservados pelo runtime', () => {
  it('on_load é método de form: não pode ser ID de componente', () => {
    expect(idProblem('on_load')).toMatch(/reservada/)
    expect(idProblem('form')).toMatch(/reservada/)
    expect(idProblem('on_loaded')).toBeNull()
  })
})

describe('store: executar e parar', () => {
  const start = vi.fn<() => Promise<RunStartResult>>()
  const stop = vi.fn<() => Promise<void>>()

  beforeEach(() => {
    start.mockReset()
    stop.mockReset()
    ;(globalThis as unknown as { window: unknown }).window = { vform: { run: { start, stop } } }
    useIde.setState({
      project: {
        dir: 'C:\\p',
        manifest: { format: 'vform-project', version: 1, name: 'p', forms: [{ name: 'Main', layout: 'Main.form.json', script: 'Main.py' }] },
        files: {}
      },
      activeForm: 'Main',
      tracked: { Main: createTracked(sampleDoc()) },
      running: false,
      runId: null,
      busy: false,
      console: []
    })
  })

  it('envia o layout atual, o caminho do script e os componentes', async () => {
    start.mockResolvedValue({ ok: true, runId: 7 })
    await useIde.getState().run()
    const payload = start.mock.calls[0] as unknown as [{ formName: string; scriptPath: string; doc: FormDocument; components: object }]
    expect(payload[0]).toMatchObject({ formName: 'Main', scriptPath: 'Main.py' })
    expect(payload[0].doc.children).toHaveLength(3)
    expect(Object.keys(payload[0].components)).toContain('textField1')
    expect(useIde.getState()).toMatchObject({ running: true, runId: 7 })
  })

  it('mostra no console o erro devolvido pelo processo principal', async () => {
    start.mockResolvedValue({ ok: false, error: 'Python 3.10+ não encontrado.' })
    await useIde.getState().run()
    expect(useIde.getState().running).toBe(false)
    expect(useIde.getState().console.at(-1)).toMatchObject({ level: 'error', text: 'Python 3.10+ não encontrado.' })
  })

  it('não executa um formulário que não pôde ser lido', async () => {
    useIde.setState({ tracked: {} })
    await useIde.getState().run()
    expect(start).not.toHaveBeenCalled()
    expect(useIde.getState().console.at(-1)?.level).toBe('error')
  })

  it('ignora o aviso de fim de uma execução antiga (F5 duas vezes seguidas)', () => {
    useIde.setState({ running: true, runId: 2 })
    useIde.getState().runEnded({ runId: 1, reason: 'stopped', code: null }) // a anterior terminando
    expect(useIde.getState()).toMatchObject({ running: true, runId: 2 })
    useIde.getState().runEnded({ runId: 2, reason: 'closed', code: null })
    expect(useIde.getState()).toMatchObject({ running: false, runId: null })
    expect(useIde.getState().console.at(-1)?.text).toBe('Execução encerrada.')
  })

  it('não repete a mensagem quando o Python caiu (o erro já foi mostrado)', () => {
    useIde.setState({ running: true, runId: 3, console: [] })
    useIde.getState().runEnded({ runId: 3, reason: 'crashed', code: 1 })
    expect(useIde.getState().running).toBe(false)
    expect(useIde.getState().console).toHaveLength(0)
  })

  it('parar só chama o processo principal quando há execução', async () => {
    await useIde.getState().stop()
    expect(stop).not.toHaveBeenCalled()
    useIde.setState({ running: true, runId: 1 })
    await useIde.getState().stop()
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
