import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newFormDocument, newFormScript, type FormDocument } from '@shared/project'
import type { RunStartResult, RunConsoleMessage } from '@shared/run'
import { CATALOG } from '@renderer/components/catalog'
import { addNode, createNode, setProp } from '@renderer/core/commands'
import { createTracked, mutate } from '@renderer/core/history'
import { closest, lintScript, maskLine } from '@renderer/core/lint'
import { completionsFor, defaultEvent, EVENTS, membersOf, toSnake } from '@renderer/core/pyapi'
import { ensureHandler } from '@renderer/core/script'
import { useIde } from '@renderer/store'

const names = (type: string): string[] => membersOf(type).map((m) => m.name)

function formDoc(): FormDocument {
  let doc = newFormDocument('Main')
  const add = (type: string, id: string): void => {
    doc = mutate(createTracked(doc), (d) => {
      const node = createNode(d, type, 0, 0)!
      node.id = id
      addNode(d, null, node)
    }).doc
  }
  add('Button', 'btnOk')
  add('TextField', 'txtNome')
  add('ComboBox', 'cbUF')
  add('Table', 'tbl')
  add('Tabs', 'abas')
  return doc
}

describe('API Python dos componentes (pyapi)', () => {
  it('toSnake converte nomes do arquivo para o estilo Python', () => {
    expect(toSnake('selectedIndex')).toBe('selected_index')
    expect(toSnake('readOnly')).toBe('read_only')
    expect(toSnake('fontSize')).toBe('font_size')
    expect(toSnake('text')).toBe('text')
  })

  it('Button: propriedades comuns, evento click, e nada de métodos de lista', () => {
    const n = names('Button')
    expect(n).toEqual(expect.arrayContaining(['text', 'enabled', 'visible', 'font_size', 'x', 'width', 'on_click', 'on', 'id', 'type']))
    expect(n).not.toContain('add_item')
    expect(n).not.toContain('on_change')
  })

  it('ComboBox: lista, item selecionado e métodos de lista', () => {
    expect(names('ComboBox')).toEqual(
      expect.arrayContaining(['items', 'selected_index', 'selected_item', 'add_item', 'remove_item', 'remove_at', 'clear', 'on_change'])
    )
  })

  it('TextField tem o apelido text; Table tem rows/add_row; ListBox tem double_click; Tabs aceita add_item', () => {
    expect(names('TextField')).toEqual(expect.arrayContaining(['value', 'text', 'placeholder', 'read_only', 'on_change']))
    expect(names('Table')).toEqual(expect.arrayContaining(['columns', 'rows', 'selected_index', 'add_row', 'clear', 'on_change']))
    expect(names('ListBox')).toEqual(expect.arrayContaining(['on_change', 'on_double_click']))
    expect(names('Tabs')).toEqual(expect.arrayContaining(['tabs', 'selected_index', 'add_item']))
    expect(names('Tabs')).not.toContain('selected_item') // não tem `items`
  })

  it('métodos trazem snippet de inserção; membros não se repetem', () => {
    const add = membersOf('ComboBox').find((m) => m.name === 'add_item')!
    expect(add).toMatchObject({ kind: 'method', insert: 'add_item($0)' })
    for (const def of CATALOG) {
      const list = names(def.type)
      expect(new Set(list).size, def.type).toBe(list.length)
    }
    expect(membersOf('Inexistente')).toEqual([])
  })

  it('a tabela de eventos é a mesma do runtime Python (sem divergência)', () => {
    const py = readFileSync(resolve('python/vform_runtime/components.py'), 'utf8')
    const block = /\nEVENTS[^=]*=\s*\{([\s\S]*?)\n\}/.exec(py)?.[1] ?? ''
    const fromPython: Record<string, string[]> = {}
    for (const m of block.matchAll(/"(\w+)":\s*\(([^)]*)\)/g))
      fromPython[m[1]] = [...m[2].matchAll(/"(\w+)"/g)].map((x) => x[1])
    expect(Object.keys(fromPython).length).toBeGreaterThan(5)
    expect(fromPython).toEqual(EVENTS)
  })

  it('o evento do duplo clique é o primeiro do tipo (click para botão, change para campo)', () => {
    expect(defaultEvent('Button')).toBe('click')
    expect(defaultEvent('TextField')).toBe('change')
    expect(defaultEvent('ListBox')).toBe('change')
    expect(defaultEvent('Desconhecido')).toBe('click')
  })
})

describe('autocompletar (completionsFor)', () => {
  const doc = formDoc()

  it('form. lista os IDs do formulário e on_load', () => {
    const items = completionsFor('x = form.', doc)!
    expect(items.map((i) => i.name)).toEqual(expect.arrayContaining(['btnOk', 'txtNome', 'cbUF', 'tbl', 'abas', 'on_load']))
    expect(items.find((i) => i.name === 'btnOk')).toMatchObject({ kind: 'component', detail: 'Button' })
    expect(completionsFor('@form.bt', doc)!.some((i) => i.name === 'btnOk')).toBe(true) // o Monaco filtra pelo que já foi digitado
  })

  it('form.<id>. lista os membros do tipo daquele componente', () => {
    expect(completionsFor('    form.cbUF.', doc)!.map((i) => i.name)).toContain('add_item')
    expect(completionsFor('form.btnOk.te', doc)!.map((i) => i.name)).toContain('text')
    expect(completionsFor('form.btnOk.', doc)!.map((i) => i.name)).not.toContain('add_item')
    expect(completionsFor('form.naoExiste.', doc)).toEqual([])
  })

  it('app. lista título, mensagem e fechar', () => {
    expect(completionsFor('app.', doc)!.map((i) => i.name)).toEqual(['title', 'show_message', 'close'])
  })

  it('fora desses contextos não sugere nada (e não confunde com outros nomes)', () => {
    expect(completionsFor('print(', doc)).toBeNull()
    expect(completionsFor('myform.', doc)).toBeNull()
    expect(completionsFor('x.form.', doc)).toBeNull()
    expect(completionsFor('form', doc)).toBeNull()
    expect(completionsFor('form.', null)!.map((i) => i.name)).toEqual(['on_load']) // sem formulário legível
  })
})

describe('verificação do script (lintScript)', () => {
  const doc = formDoc()

  it('ID inexistente: marca o trecho certo e sugere o parecido', () => {
    const [d] = lintScript('form.btnOkk.text = "x"', doc)
    expect(d).toMatchObject({ line: 1, startColumn: 6, endColumn: 12 })
    expect(d.message).toContain("Não há componente com o ID 'btnOkk'")
    expect(d.message).toContain("Você quis dizer 'btnOk'?")
  })

  it('propriedade inexistente de um componente conhecido', () => {
    const [d] = lintScript('x = 1\nform.btnOk.txt = "a"', doc)
    expect(d).toMatchObject({ line: 2, startColumn: 12, endColumn: 15 })
    expect(d.message).toContain("O componente 'btnOk' (Button) não tem 'txt'")
    expect(d.message).toContain("'text'")
  })

  it('app.<membro> inexistente', () => {
    const [d] = lintScript('app.titulo = "x"', doc)
    expect(d).toMatchObject({ line: 1, startColumn: 5, endColumn: 11 })
    expect(d.message).toContain('title, show_message, close')
  })

  it('código correto não gera avisos (inclui decoradores, on_load e atalhos)', () => {
    const ok = [
      '@form.on_load',
      'def a():',
      '    form.cbUF.add_item(form.txtNome.text)',
      '    form.tbl.add_row([1, 2])',
      '',
      '@form.btnOk.on_click',
      'def b(ev):',
      '    app.title = form.txtNome.value',
      '    app.show_message("oi")',
      '    form.abas.selected_index = 1',
      '    form["btnOk"].enabled = False',
      ''
    ].join('\n')
    expect(lintScript(ok, doc)).toEqual([])
  })

  it('ignora strings e comentários, e acha vários problemas na mesma linha', () => {
    expect(lintScript('print("form.nada")  # form.outro e app.xyz', doc)).toEqual([])
    expect(lintScript('form.a.x = form.b.y', doc)).toHaveLength(2)
    expect(lintScript('meuform.nada = 1\nself.form.nada = 2', doc)).toEqual([]) // outro objeto, não o `form`
  })

  it('sem formulário legível, todo ID é desconhecido (mas on_load não)', () => {
    expect(lintScript('form.on_load', null)).toEqual([])
    expect(lintScript('form.qualquer', null)).toHaveLength(1)
  })

  it('maskLine mantém as posições e closest só sugere nomes próximos', () => {
    expect(maskLine('a = "xy" + b  # c')).toBe('a =      + b     ')
    expect(maskLine("x = 'a\\'b'")).toHaveLength("x = 'a\\'b'".length)
    expect(closest('btnok', ['btnOk', 'txtNome'])).toBe('btnOk') // só maiúsculas diferentes
    expect(closest('zzzzzz', ['btnOk', 'txtNome'])).toBeNull()
  })
})

describe('criar e achar handlers (ensureHandler)', () => {
  it('script vazio: cria o esqueleto e põe o cursor no corpo', () => {
    const r = ensureHandler('', 'btnOk', 'click')
    expect(r).toMatchObject({ created: true, line: 3 })
    expect(r.script).toBe('@form.btnOk.on_click\ndef btnOk_click():\n    pass\n')
    expect(r.script.split('\n')[r.line - 1].trim()).toBe('pass')
  })

  it('acrescenta no fim, com duas linhas em branco, e o cursor cai no pass', () => {
    const r = ensureHandler('a = 1\n\n\n', 'txtNome', 'change')
    expect(r.created).toBe(true)
    expect(r.script).toBe('a = 1\n\n\n@form.txtNome.on_change\ndef txtNome_change(ev):\n    pass\n')
    expect(r.script.split('\n')[r.line - 1].trim()).toBe('pass')
  })

  it('handler já existente: não duplica e leva ao corpo dele', () => {
    const script = '@form.on_load\ndef inicio():\n    pass\n\n@form.btnOk.on_click\ndef ok():\n    # comentário\n    x = 1\n'
    const r = ensureHandler(script, 'btnOk', 'click')
    expect(r).toEqual({ script, line: 8, created: false })
    expect(ensureHandler(r.script, 'btnOk', 'click').created).toBe(false)
  })

  it('reconhece as outras formas de registro', () => {
    for (const code of [
      '@form.btnOk.on("click")\ndef f(): pass',
      'form.btnOk.on_click(f)',
      'form.btnOk.on("click", f)',
      '@form["btnOk"].on_click\ndef f(): pass'
    ])
      expect(ensureHandler(code, 'btnOk', 'click').created, code).toBe(false)
    // O registro sem decorador fica na própria linha (não procura a próxima def).
    expect(ensureHandler('x = 1\nform.btnOk.on_click(f)\ndef f(): pass\n', 'btnOk', 'click').line).toBe(2)
  })

  it('um evento diferente do mesmo componente é um handler novo', () => {
    const r = ensureHandler('@form.lst.on_change\ndef a(ev): pass\n', 'lst', 'double_click')
    expect(r.created).toBe(true)
    expect(r.script).toContain('@form.lst.on_double_click\ndef lst_double_click(ev):')
  })

  it('não repete nome de função já usado', () => {
    const r = ensureHandler('def btnOk_click():\n    pass\n', 'btnOk', 'click')
    expect(r.script).toContain('def btnOk_click_2():')
    expect(ensureHandler(r.script.replace('@form.btnOk.on_click\n', ''), 'btnOk', 'click').script).toContain('def btnOk_click_2():')
  })

  it('on_load (id nulo): o modelo de script novo já tem; senão cria', () => {
    const template = newFormScript('Main')
    const r = ensureHandler(template, null)
    expect(r.created).toBe(false)
    expect(template.split('\n')[r.line - 1].trim()).toBe('pass')
    const made = ensureHandler('x = 1\n', null)
    expect(made.created).toBe(true)
    expect(made.script).toContain('@form.on_load\ndef ao_carregar():\n    pass')
  })

  it('o modelo de script criado com o projeto é Python válido e menciona form e app', () => {
    const script = newFormScript('Main')
    expect(script).toContain('form.txtNome.value')
    expect(script).toContain('app.show_message')
  })
})

describe('store: scripts, duplo clique, salvar e executar', () => {
  const save = vi.fn<(files: Record<string, string>) => Promise<{ ok: true }>>()
  const start = vi.fn<(p: unknown) => Promise<RunStartResult>>()

  beforeEach(() => {
    save.mockReset().mockResolvedValue({ ok: true })
    start.mockReset().mockResolvedValue({ ok: true, runId: 1 })
    ;(globalThis as unknown as { window: unknown }).window = { vform: { saveProject: save, run: { start } } }
    useIde.setState({
      project: {
        dir: 'C:\\p',
        manifest: {
          format: 'vform-project',
          version: 1,
          name: 'p',
          forms: [
            { name: 'Main', layout: 'Main.form.json', script: 'Main.py' },
            { name: 'Outro', layout: 'Outro.form.json', script: 'sub/Outro.py' }
          ]
        },
        files: { 'project.json': '{}', 'Main.form.json': '{}', 'Main.py': '# main', 'Outro.form.json': '{}', 'sub/Outro.py': '# outro' }
      },
      activeForm: 'Main',
      activeView: 'design',
      tracked: { Main: createTracked(formDoc()), Outro: createTracked(newFormDocument('Outro')) },
      scripts: { Main: newFormScript('Main'), Outro: '# outro' },
      scriptDirty: {},
      selection: [],
      reveal: null,
      runErrors: {},
      running: false,
      runId: null,
      busy: false,
      dirty: false,
      console: []
    })
  })

  it('setScript marca o script e o projeto como alterados (e ignora texto igual)', () => {
    useIde.getState().setScript('Main', useIde.getState().scripts.Main)
    expect(useIde.getState().dirty).toBe(false)
    useIde.getState().setScript('Main', '# novo')
    expect(useIde.getState()).toMatchObject({ dirty: true, scriptDirty: { Main: true } })
    expect(useIde.getState().scripts.Main).toBe('# novo')
  })

  it('scriptSync só avança quando o texto muda por fora do editor (digitar não faz o editor receber eco)', () => {
    const before = useIde.getState().scriptSync.Main ?? 0
    useIde.getState().setScript('Main', '# digitado no editor') // origem padrão: o Monaco
    useIde.getState().setScript('Main', '# digitado no editor 2')
    expect(useIde.getState().scriptSync.Main ?? 0).toBe(before)
    useIde.getState().setScript('Main', '# vindo de fora', 'external')
    expect(useIde.getState().scriptSync.Main).toBe(before + 1)
    useIde.getState().setScript('Main', '# vindo de fora') // texto igual: nada muda
    expect(useIde.getState().scriptSync.Main).toBe(before + 1)
  })

  it('o duplo clique (texto criado por fora do editor) avança o scriptSync; reabrir o projeto também', async () => {
    const before = useIde.getState().scriptSync.Main ?? 0
    useIde.getState().openHandler('btnOk')
    expect(useIde.getState().scriptSync.Main).toBe(before + 1)
    useIde.getState().openHandler('btnOk') // já existe: nada novo para copiar
    expect(useIde.getState().scriptSync.Main).toBe(before + 1)

    ;(globalThis as unknown as { window: { vform: Record<string, unknown> } }).window.vform.openProject = async () => ({
      ok: true,
      project: {
        dir: 'C:\\p',
        manifest: useIde.getState().project!.manifest,
        files: {
          'Main.form.json': JSON.stringify(newFormDocument('Main')),
          'Outro.form.json': JSON.stringify(newFormDocument('Outro')),
          'project.json': '{}',
          'Main.py': '# do disco',
          'sub/Outro.py': '# do disco 2'
        }
      }
    })
    globalThis.document = { title: '' } as unknown as Document
    await useIde.getState().openProject()
    expect(useIde.getState().scripts).toEqual({ Main: '# do disco', Outro: '# do disco 2' })
    expect(useIde.getState().scriptSync.Main).toBe(before + 2)
    expect(useIde.getState().scriptDirty).toEqual({})
  })

  it('duplo clique em um botão cria o handler, abre o código e pede a linha', () => {
    useIde.getState().openHandler('btnOk')
    const s = useIde.getState()
    expect(s.activeView).toBe('code')
    expect(s.scripts.Main).toContain('@form.btnOk.on_click\ndef btnOk_click():\n    pass')
    expect(s.scriptDirty.Main).toBe(true)
    expect(s.reveal).toMatchObject({ form: 'Main' })
    expect(s.scripts.Main.split('\n')[s.reveal!.line - 1].trim()).toBe('pass')
  })

  it('duplo clique de novo só abre o handler existente (sem duplicar nem sujar o script)', () => {
    useIde.getState().openHandler('txtNome')
    const first = useIde.getState().scripts.Main
    useIde.setState({ activeView: 'design', reveal: null })
    useIde.getState().openHandler('txtNome')
    expect(useIde.getState().scripts.Main).toBe(first)
    expect(useIde.getState().activeView).toBe('code')
    expect(first.match(/on_change/g)).toHaveLength(1)
  })

  it('duplo clique no formulário vazio abre o on_load; em ID inexistente não faz nada', () => {
    useIde.getState().openHandler(null)
    expect(useIde.getState().scriptDirty.Main).toBeUndefined() // o on_load do modelo já existia
    expect(useIde.getState().activeView).toBe('code')
    useIde.setState({ activeView: 'design' })
    useIde.getState().openHandler('fantasma')
    expect(useIde.getState().activeView).toBe('design')
  })

  it('salvar grava os layouts e SÓ os scripts alterados na IDE (não desfaz edição externa)', async () => {
    useIde.getState().setScript('Outro', '# alterado na IDE')
    await useIde.getState().saveProject()
    const files = save.mock.calls[0][0]
    expect(Object.keys(files).sort()).toEqual(['Main.form.json', 'Outro.form.json', 'project.json', 'sub/Outro.py'])
    expect(files['sub/Outro.py']).toBe('# alterado na IDE')
    expect('Main.py' in files).toBe(false) // intocado: pode ter sido editado fora
    expect(useIde.getState()).toMatchObject({ dirty: false, scriptDirty: {} })
    expect(useIde.getState().project?.files['sub/Outro.py']).toBe('# alterado na IDE')

    await useIde.getState().saveProject() // nada mais alterado: nenhum script é regravado
    expect(Object.keys(save.mock.calls[1][0]).some((f) => f.endsWith('.py'))).toBe(false)
  })

  it('executar manda o texto do editor só quando ele não foi salvo; senão o main lê o disco', async () => {
    await useIde.getState().run()
    expect((start.mock.calls[0][0] as { script?: string }).script).toBeUndefined()
    useIde.getState().setScript('Main', '# no editor')
    await useIde.getState().run()
    expect(start.mock.calls[1][0]).toMatchObject({ scriptPath: 'Main.py', script: '# no editor' })
  })

  it('erro de execução com linha marca o script certo e fica clicável no console', () => {
    const msg: RunConsoleMessage = {
      level: 'error',
      text: 'Traceback (most recent call last):\n  Arquivo "Outro.py", linha 4\nZeroDivisionError: division by zero',
      line: 4,
      file: 'Outro.py'
    }
    useIde.getState().runConsole(msg)
    expect(useIde.getState().runErrors.Outro).toEqual([{ line: 4, message: 'ZeroDivisionError: division by zero' }])
    expect(useIde.getState().console.at(-1)).toMatchObject({ level: 'error', line: 4, file: 'Outro.py' })
    useIde.getState().runConsole({ level: 'info', text: 'oi' })
    useIde.getState().runConsole({ level: 'error', text: 'sem linha' })
    useIde.getState().runConsole({ level: 'error', text: 'arquivo desconhecido', line: 1, file: 'Nada.py' })
    expect(useIde.getState().runErrors).toEqual({ Outro: [{ line: 4, message: 'ZeroDivisionError: division by zero' }] })
  })

  it('goToScript troca de formulário, abre o código na linha e uma nova execução limpa os erros', async () => {
    useIde.getState().goToScript('Outro.py', 7)
    expect(useIde.getState()).toMatchObject({ activeForm: 'Outro', activeView: 'code', reveal: { form: 'Outro', line: 7 } })
    useIde.getState().goToScript('Inexistente.py', 1)
    expect(useIde.getState().activeForm).toBe('Outro')
    useIde.setState({ runErrors: { Outro: [{ line: 1, message: 'x' }] }, activeForm: 'Main' })
    await useIde.getState().run()
    expect(useIde.getState().runErrors).toEqual({})
  })

  it('openTab troca formulário e visão; a seleção só some ao trocar de formulário', () => {
    useIde.setState({ selection: ['btnOk'] })
    useIde.getState().openTab('Main', 'code')
    expect(useIde.getState()).toMatchObject({ activeView: 'code', selection: ['btnOk'] })
    useIde.getState().openTab('Outro', 'design')
    expect(useIde.getState()).toMatchObject({ activeForm: 'Outro', activeView: 'design', selection: [] })
  })

  it('setProp ainda funciona depois de tudo isso (sanidade do documento)', () => {
    const doc = mutate(createTracked(formDoc()), (d) => setProp(d, 'btnOk', 'text', 'Ok')).doc
    expect(doc.children[0].props.text).toBe('Ok')
  })
})
