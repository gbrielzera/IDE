import { beforeEach, describe, expect, it } from 'vitest'
import { newFormDocument, newFormScript, type FormDocument } from '@shared/project'
import { addNode, createNode } from '@renderer/core/commands'
import { createTracked, mutate } from '@renderer/core/history'
import { lintScript, maskLine } from '@renderer/core/lint'
import { renameInScript } from '@renderer/core/refactor'
import { useIde } from '@renderer/store'

function formDoc(): FormDocument {
  let doc = newFormDocument('Main')
  for (const [type, id] of [['Button', 'btnOk'], ['TextField', 'txtNome'], ['Label', 'lblInfo']] as const) {
    doc = mutate(createTracked(doc), (d) => {
      const node = createNode(d, type, 0, 0)!
      node.id = id
      addNode(d, null, node)
    }).doc
  }
  return doc
}

describe('maskLine entende f-strings', () => {
  it('o que está entre chaves de uma f-string é código; o resto do texto continua escondido', () => {
    const masked = maskLine('x = f"Olá, {form.txtNome.value}! form.fake"')
    expect(masked).toContain('form.txtNome.value')
    expect(masked).not.toContain('Olá')
    expect(masked).not.toContain('form.fake')
    expect(masked).toHaveLength('x = f"Olá, {form.txtNome.value}! form.fake"'.length)
  })

  it('chaves duplas são texto literal; prefixos rf/fr/F valem; strings comuns e bytes não têm código', () => {
    expect(maskLine('f"{{form.a}}"')).not.toContain('form.a')
    expect(maskLine("rf'{form.a}'")).toContain('form.a')
    expect(maskLine('F"{form.a}"')).toContain('form.a')
    expect(maskLine('"{form.a}"')).not.toContain('form.a')
    expect(maskLine('b"{form.a}"')).not.toContain('form.a')
    expect(maskLine('print("f", form.a)')).toContain('form.a') // o `f` isolado não torna a string uma f-string
  })

  it('chaves aninhadas, escapes e linhas incompletas não quebram', () => {
    expect(maskLine('f"{ {1: form.a}[1] }"')).toContain('form.a')
    expect(maskLine('f"a\\"{form.a}"')).toContain('form.a')
    expect(maskLine('f"abc\\')).toHaveLength('f"abc\\'.length)
    expect(maskLine('f"{form.a')).toContain('form.a') // expressão não fechada: tudo é código até o fim
    expect(maskLine('x = 1  # form.a')).not.toContain('form.a')
  })

  it('o aviso de ID inexistente também vale dentro de f-strings', () => {
    const doc = formDoc()
    const [d] = lintScript('msg = f"Oi {form.txtNomee.value}"', doc)
    expect(d.message).toContain("'txtNomee'")
    expect(d.message).toContain("Você quis dizer 'txtNome'?")
    expect(lintScript('msg = f"Oi {form.txtNome.value}"', doc)).toEqual([])
  })
})

describe('renameInScript', () => {
  it('troca todas as formas de referência em código', () => {
    const src = [
      '@form.btnOk.on_click',
      'def a(ev):',
      '    form.btnOk.text = "Salvar"',
      '    x = form["btnOk"].enabled',
      "    y = form['btnOk']",
      '    form.lblInfo.text = f"{form.btnOk.text} / {form.txtNome.value}"',
      '    form.btnOk.on("click", a)'
    ].join('\n')
    const r = renameInScript(src, 'btnOk', 'btnSalvar')
    expect(r.count).toBe(6)
    expect(r.script).toBe(
      [
        '@form.btnSalvar.on_click',
        'def a(ev):',
        '    form.btnSalvar.text = "Salvar"',
        '    x = form["btnSalvar"].enabled',
        "    y = form['btnSalvar']",
        '    form.lblInfo.text = f"{form.btnSalvar.text} / {form.txtNome.value}"',
        '    form.btnSalvar.on("click", a)'
      ].join('\n')
    )
  })

  it('não mexe em comentários, textos comuns, nem em outros objetos', () => {
    const src = [
      '# form.btnOk é o botão',
      'print("form.btnOk")',
      'x = meuform.btnOk',
      'y = self.form.btnOk',
      'form.btnOk.text = "a"  # form.btnOk de novo'
    ].join('\n')
    const r = renameInScript(src, 'btnOk', 'btnNovo')
    expect(r.count).toBe(1)
    expect(r.script.split('\n')).toEqual([
      '# form.btnOk é o botão',
      'print("form.btnOk")',
      'x = meuform.btnOk',
      'y = self.form.btnOk',
      'form.btnNovo.text = "a"  # form.btnOk de novo'
    ])
  })

  it('IDs parecidos não se confundem (btn não afeta btnOk; btnOk não afeta btnOk2)', () => {
    const src = 'form.btn.x = 1\nform.btnOk.x = 2\nform.btnOk2.x = 3\nform.Obtn.x = 4'
    expect(renameInScript(src, 'btn', 'b').script).toBe('b.x = 1'.replace('b.x', 'form.b.x') + '\nform.btnOk.x = 2\nform.btnOk2.x = 3\nform.Obtn.x = 4')
    expect(renameInScript(src, 'btnOk', 'z').script).toBe('form.btn.x = 1\nform.z.x = 2\nform.btnOk2.x = 3\nform.Obtn.x = 4')
  })

  it('várias referências na mesma linha, IDs com acento, e CRLF preservado', () => {
    expect(renameInScript('form.a.x = form.a.y + form.a.z', 'a', 'bb')).toEqual({ script: 'form.bb.x = form.bb.y + form.bb.z', count: 3 })
    expect(renameInScript('form.ação.text = 1', 'ação', 'acao').script).toBe('form.acao.text = 1')
    expect(renameInScript('form.a.x = 1\r\nform.a.y = 2\r\n', 'a', 'b').script).toBe('form.b.x = 1\r\nform.b.y = 2\r\n')
  })

  it('sem mudança quando o ID é o mesmo, vazio ou não aparece', () => {
    const src = 'form.a.x = 1'
    expect(renameInScript(src, 'a', 'a')).toEqual({ script: src, count: 0 })
    expect(renameInScript(src, '', 'b')).toEqual({ script: src, count: 0 })
    expect(renameInScript(src, 'zzz', 'b')).toEqual({ script: src, count: 0 })
    expect(renameInScript('', 'a', 'b')).toEqual({ script: '', count: 0 })
  })

  it('o modelo de script novo não tem referências a um ID qualquer (comentários não contam)', () => {
    expect(renameInScript(newFormScript('Main'), 'txtNome', 'x').count).toBe(0)
  })
})

describe('store: renomear um ID atualiza o código (e desfazer/refazer também)', () => {
  const script = '@form.btnOk.on_click\ndef f():\n    form.lblInfo.text = f"Oi {form.txtNome.value}"\n    form.btnOk.enabled = False\n'

  beforeEach(() => {
    useIde.setState({
      project: {
        dir: 'C:\\p',
        manifest: { format: 'vform-project', version: 1, name: 'p', forms: [{ name: 'Main', layout: 'Main.form.json', script: 'Main.py' }] },
        files: {}
      },
      tracked: { Main: createTracked(formDoc()) },
      scripts: { Main: script },
      scriptDirty: {},
      scriptSync: {},
      activeForm: 'Main',
      selection: ['txtNome'],
      console: [],
      dirty: false
    })
  })

  it('renomear troca as referências no script, marca como alterado e avisa no console', () => {
    expect(useIde.getState().renameComponent('btnOk', 'btnSalvar')).toBeNull()
    const s = useIde.getState()
    expect(s.scripts.Main).toBe(script.replace(/btnOk/g, 'btnSalvar'))
    expect(s.scriptDirty.Main).toBe(true)
    expect(s.scriptSync.Main).toBe(1) // o editor aberto recebe o texto novo
    expect(s.console.at(-1)).toMatchObject({ level: 'info' })
    expect(s.console.at(-1)!.text).toContain('"btnOk" → "btnSalvar" (2 referências atualizadas em Main.py)')
  })

  it('dentro de f-strings também (txtNome)', () => {
    useIde.getState().renameComponent('txtNome', 'edtNome')
    expect(useIde.getState().scripts.Main).toContain('f"Oi {form.edtNome.value}"')
    expect(useIde.getState().console.at(-1)!.text).toContain('1 referência atualizada')
  })

  it('desfazer volta o ID e o código; refazer aplica de novo', () => {
    useIde.getState().renameComponent('btnOk', 'btnSalvar')
    useIde.getState().undo()
    expect(useIde.getState().scripts.Main).toBe(script)
    expect(useIde.getState().currentDoc()!.children[0].id).toBe('btnOk')
    useIde.getState().redo()
    expect(useIde.getState().scripts.Main).toBe(script.replace(/btnOk/g, 'btnSalvar'))
    expect(useIde.getState().currentDoc()!.children[0].id).toBe('btnSalvar')
  })

  it('sem referências no código, o script nem fica "alterado"; ID inválido não mexe em nada', () => {
    useIde.getState().renameComponent('lblInfo', 'lblMensagem') // `form.lblInfo.text = ...` existe: 1 referência
    expect(useIde.getState().scripts.Main).toContain('form.lblMensagem.text')
    useIde.setState({ scripts: { Main: '# nada aqui\n' }, scriptDirty: {}, console: [] })
    useIde.getState().renameComponent('txtNome', 'edtNome')
    expect(useIde.getState().scriptDirty.Main).toBeUndefined()
    expect(useIde.getState().console).toHaveLength(0)
    expect(useIde.getState().renameComponent('edtNome', 'class')).toMatch(/reservada/)
    expect(useIde.getState().scripts.Main).toBe('# nada aqui\n')
  })

  it('renomear em sequência e desfazer passo a passo acompanha o código na ordem certa', () => {
    useIde.getState().renameComponent('btnOk', 'a')
    useIde.getState().renameComponent('a', 'b')
    expect(useIde.getState().scripts.Main).toContain('form.b.enabled')
    useIde.getState().undo()
    expect(useIde.getState().scripts.Main).toContain('form.a.enabled')
    useIde.getState().undo()
    expect(useIde.getState().scripts.Main).toBe(script)
  })
})
