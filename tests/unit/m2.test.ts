import { beforeEach, describe, expect, it } from 'vitest'
import { newFormDocument, type FormDocument } from '@shared/project'
import { allPropDefs, defaultProps, propDef } from '@renderer/components/catalog'
import {
  addNode,
  createNode,
  moveToIndex,
  renameNode,
  reparentNodes,
  setFormProps,
  setProp
} from '@renderer/core/commands'
import { createTracked, mutate, undo, type Tracked } from '@renderer/core/history'
import { parseFormDocument, serializeForm } from '@renderer/core/model'
import { activeTab, getProp, isAutoLayout, layoutOf } from '@renderer/core/props'
import { absPos, locate } from '@renderer/core/tree'
import { useIde } from '@renderer/store'

const empty = (): FormDocument => newFormDocument('Main')
const edit = (t: Tracked, recipe: (d: FormDocument) => void, txn?: string): Tracked => mutate(t, recipe, txn)

/** Panel (panel1) com button1, label1 e textField1, nessa ordem. */
function panelWithChildren(): Tracked {
  let t = createTracked(empty())
  t = edit(t, (d) => addNode(d, null, createNode(d, 'Panel', 0, 0)!))
  for (const type of ['Button', 'Label', 'TextField']) t = edit(t, (d) => addNode(d, 'panel1', createNode(d, type, 0, 0)!))
  return t
}

const childIds = (t: Tracked, parent: string): string[] =>
  (locate(t.doc, parent)?.node.children ?? []).map((c) => c.id)

describe('catálogo e propriedades', () => {
  it('grava só as propriedades específicas ao criar, em cópias independentes', () => {
    expect(defaultProps('Button')).toEqual({ text: 'Button' })
    const a = defaultProps('ListBox')
    ;(a.items as string[]).push('X')
    expect(defaultProps('ListBox').items).toEqual(['Item 1', 'Item 2', 'Item 3'])
    expect(defaultProps('Desconhecido')).toEqual({})
  })

  it('separa propriedades específicas das comuns, e só aceita as comuns do tipo', () => {
    expect(propDef('Button', 'text')?.type).toBe('string')
    expect(propDef('Button', 'fontSize')?.default).toBe(12)
    expect(propDef('Image', 'fontSize')).toBeUndefined() // Image não tem fonte
    expect(propDef('Label', 'nada')).toBeUndefined()
    const { own, common } = allPropDefs('Panel')
    expect(own.map((p) => p.key)).toEqual(['layout', 'gap', 'padding', 'align'])
    expect(common.map((p) => p.key)).toEqual(['enabled', 'visible', 'background', 'tooltip'])
  })

  it('getProp cai no padrão do schema quando o arquivo não grava o valor', () => {
    const d = empty()
    const btn = createNode(d, 'Button', 0, 0)!
    expect(getProp(btn, 'text')).toBe('Button')
    expect(getProp(btn, 'enabled')).toBe(true)
    expect(getProp(btn, 'fontSize')).toBe(12)
    btn.props.fontSize = 20
    expect(getProp(btn, 'fontSize')).toBe(20)
  })

  it('setProp remove do arquivo as propriedades comuns que voltam ao padrão', () => {
    let t = edit(createTracked(empty()), (d) => addNode(d, null, createNode(d, 'Button', 0, 0)!))
    t = edit(t, (d) => setProp(d, 'button1', 'fontSize', 20))
    t = edit(t, (d) => setProp(d, 'button1', 'enabled', false))
    expect(locate(t.doc, 'button1')?.node.props).toMatchObject({ fontSize: 20, enabled: false })
    t = edit(t, (d) => setProp(d, 'button1', 'fontSize', 12))
    t = edit(t, (d) => setProp(d, 'button1', 'enabled', true))
    expect('fontSize' in locate(t.doc, 'button1')!.node.props).toBe(false)
    expect('enabled' in locate(t.doc, 'button1')!.node.props).toBe(false)
    // As específicas continuam gravadas, mesmo iguais ao padrão.
    t = edit(t, (d) => setProp(d, 'button1', 'text', 'Button'))
    expect(locate(t.doc, 'button1')?.node.props.text).toBe('Button')
  })

  it('setFormProps aplica título e limita o tamanho mínimo', () => {
    const t = edit(createTracked(empty()), (d) => setFormProps(d, { title: 'Cadastro', width: 10, height: 700.4 }))
    expect(t.doc).toMatchObject({ title: 'Cadastro', width: 100, height: 700 })
  })
})

describe('renomear ID', () => {
  it('renomeia quando válido e livre; ignora inválido ou já em uso', () => {
    let t = panelWithChildren()
    t = edit(t, (d) => renameNode(d, 'button1', 'btnSalvar'))
    expect(childIds(t, 'panel1')).toEqual(['btnSalvar', 'label1', 'textField1'])
    const same = edit(t, (d) => renameNode(d, 'btnSalvar', 'class'))
    const dup = edit(t, (d) => renameNode(d, 'btnSalvar', 'label1'))
    expect(same.doc).toBe(t.doc)
    expect(dup.doc).toBe(t.doc)
    expect(undo(t).doc).not.toBe(t.doc) // e é desfazível
  })
})

describe('auto-layout e reordenação', () => {
  it('layoutOf lê o auto-layout do Panel com padrões; outros tipos são sempre absolutos', () => {
    let t = panelWithChildren()
    const panel = (): ReturnType<typeof layoutOf> => layoutOf(locate(t.doc, 'panel1')!.node)
    expect(panel()).toEqual({ mode: 'absolute', gap: 8, padding: 8, align: 'start' })
    t = edit(t, (d) => setProp(d, 'panel1', 'layout', 'vertical'))
    expect(panel().mode).toBe('vertical')
    expect(isAutoLayout(locate(t.doc, 'panel1')!.node)).toBe(true)
    expect(layoutOf(locate(t.doc, 'button1')!.node).mode).toBe('absolute')
  })

  it('moveToIndex reordena na mesma lista (índice já ocupado não gera mudança)', () => {
    const t = panelWithChildren()
    const t1 = edit(t, (d) => moveToIndex(d, 'textField1', 'panel1', 0))
    expect(childIds(t1, 'panel1')).toEqual(['textField1', 'button1', 'label1'])
    const t2 = edit(t1, (d) => moveToIndex(d, 'textField1', 'panel1', 2))
    expect(childIds(t2, 'panel1')).toEqual(['button1', 'label1', 'textField1'])
    expect(edit(t, (d) => moveToIndex(d, 'button1', 'panel1', 0))).toBe(t) // já é o primeiro
    expect(edit(t, (d) => moveToIndex(d, 'button1', 'panel1', -5))).toBe(t) // limitado a 0
    const t3 = edit(t, (d) => moveToIndex(d, 'button1', 'panel1', 99)) // limitado ao fim
    expect(childIds(t3, 'panel1')).toEqual(['label1', 'textField1', 'button1'])
  })

  it('moveToIndex entre pais insere na posição e recusa mover para dentro de si', () => {
    let t = panelWithChildren()
    t = edit(t, (d) => addNode(d, null, createNode(d, 'Panel', 300, 0)!))
    t = edit(t, (d) => moveToIndex(d, 'label1', 'panel2', 0))
    expect(childIds(t, 'panel1')).toEqual(['button1', 'textField1'])
    expect(childIds(t, 'panel2')).toEqual(['label1'])
    expect(edit(t, (d) => moveToIndex(d, 'panel1', 'panel1', 0))).toBe(t)
    const top = edit(t, (d) => moveToIndex(d, 'label1', null, 0))
    expect(top.doc.children.map((c) => c.id)).toEqual(['label1', 'panel1', 'panel2'])
  })

  it('addNode respeita o índice pedido', () => {
    let t = panelWithChildren()
    t = edit(t, (d) => addNode(d, 'panel1', createNode(d, 'Image', 0, 0)!, 1))
    expect(childIds(t, 'panel1')).toEqual(['button1', 'image1', 'label1', 'textField1'])
  })

  it('setas em auto-layout reordenam em vez de mover pixels (store)', () => {
    let t = panelWithChildren()
    t = edit(t, (d) => setProp(d, 'panel1', 'layout', 'vertical'))
    useIde.setState({ tracked: { Main: t }, activeForm: 'Main', selection: ['label1'] })
    useIde.getState().nudgeSelection(0, 1) // ↓ no layout vertical
    expect(childIds(useIde.getState().tracked.Main, 'panel1')).toEqual(['button1', 'textField1', 'label1'])
    useIde.getState().nudgeSelection(0, -1)
    useIde.getState().nudgeSelection(0, -1)
    expect(childIds(useIde.getState().tracked.Main, 'panel1')).toEqual(['label1', 'button1', 'textField1'])
    useIde.getState().nudgeSelection(1, 0) // → não é o eixo do layout vertical: nada acontece
    expect(childIds(useIde.getState().tracked.Main, 'panel1')).toEqual(['label1', 'button1', 'textField1'])
  })
})

describe('Tabs: conteúdo por aba', () => {
  function withTabs(selected = 0): Tracked {
    let t = createTracked(empty())
    t = edit(t, (d) => addNode(d, null, createNode(d, 'Tabs', 50, 50)!))
    return edit(t, (d) => setProp(d, 'tabs1', 'selectedIndex', selected))
  }

  it('o filho nasce na aba selecionada; fora de Tabs não tem aba', () => {
    let t = withTabs(1)
    t = edit(t, (d) => addNode(d, 'tabs1', createNode(d, 'Label', 0, 0)!))
    expect(locate(t.doc, 'label1')?.node.tab).toBe(1)
    t = edit(t, (d) => addNode(d, null, createNode(d, 'Button', 0, 0)!))
    expect(locate(t.doc, 'button1')?.node.tab).toBeUndefined()
  })

  it('activeTab limita a aba ao número de abas', () => {
    const t = withTabs(9)
    expect(activeTab(locate(t.doc, 'tabs1')!.node)).toBe(1) // 2 abas: índice máximo 1
    expect(activeTab(locate(withTabs(0).doc, 'tabs1')!.node)).toBe(0)
  })

  it('a posição é relativa ao corpo da aba (abaixo do cabeçalho de 24px)', () => {
    let t = withTabs()
    t = edit(t, (d) => addNode(d, 'tabs1', createNode(d, 'Label', 10, 10)!))
    expect(absPos(t.doc, 'label1')).toEqual({ x: 60, y: 84 }) // 50+10, 50+24+10
  })

  it('reparent para Tabs mantém a posição visual e define a aba; sair remove a aba', () => {
    let t = withTabs(1)
    t = edit(t, (d) => addNode(d, null, createNode(d, 'Button', 100, 100)!))
    t = edit(t, (d) => reparentNodes(d, ['button1'], 'tabs1'))
    expect(locate(t.doc, 'button1')?.node).toMatchObject({ tab: 1, x: 50, y: 26 }) // 100-50, 100-(50+24)
    expect(absPos(t.doc, 'button1')).toEqual({ x: 100, y: 100 })
    t = edit(t, (d) => reparentNodes(d, ['button1'], null))
    expect(locate(t.doc, 'button1')?.node.tab).toBeUndefined()
    expect(absPos(t.doc, 'button1')).toEqual({ x: 100, y: 100 })
  })

  it('reparent com posições explícitas (quem sai de um auto-layout) e limita ao pai', () => {
    let t = panelWithChildren()
    t = edit(t, (d) => setProp(d, 'panel1', 'layout', 'vertical'))
    t = edit(t, (d) => reparentNodes(d, ['button1'], null, { button1: { x: 77, y: 33 } }))
    expect(locate(t.doc, 'button1')?.node).toMatchObject({ x: 77, y: 33 })
    t = edit(t, (d) => reparentNodes(d, ['label1'], null, { label1: { x: 9999, y: -5 } }))
    expect(locate(t.doc, 'label1')?.node).toMatchObject({ x: 640 - 120, y: 0 }) // dentro do formulário
  })
})

describe('arquivo', () => {
  it('lê e grava a aba dos filhos de Tabs sem perdas', () => {
    let t = createTracked(empty())
    t = edit(t, (d) => addNode(d, null, createNode(d, 'Tabs', 0, 0)!))
    t = edit(t, (d) => addNode(d, 'tabs1', createNode(d, 'Label', 4, 4)!))
    const back = parseFormDocument(serializeForm(t.doc))
    expect(back).toEqual(t.doc)
    expect(locate(back, 'label1')?.node.tab).toBe(0)
  })

  it('rejeita aba que não é número', () => {
    const doc = { ...empty(), children: [{ id: 'a', type: 'Label', x: 0, y: 0, width: 1, height: 1, tab: 'x' }] }
    expect(() => parseFormDocument(JSON.stringify(doc))).toThrow(/número/)
  })

  it('formulários do M1 (sem propriedades novas) continuam abrindo com os padrões', () => {
    const old = {
      ...empty(),
      children: [{ id: 'panel1', type: 'Panel', x: 0, y: 0, width: 240, height: 160, props: {}, children: [] }]
    }
    const doc = parseFormDocument(JSON.stringify(old))
    expect(layoutOf(doc.children[0]).mode).toBe('absolute')
  })
})

describe('store: propriedades', () => {
  beforeEach(() => {
    const t = edit(createTracked(empty()), (d) => {
      addNode(d, null, createNode(d, 'Button', 0, 0)!)
      addNode(d, null, createNode(d, 'Label', 0, 40)!)
    })
    useIde.setState({ tracked: { Main: t }, activeForm: 'Main', selection: ['button1'], dirty: false })
  })

  it('renameComponent devolve a mensagem do problema, sem alterar nada', () => {
    const { renameComponent } = useIde.getState()
    expect(renameComponent('button1', '')).toMatch(/vazio/)
    expect(renameComponent('button1', '1abc')).toMatch(/letras/)
    expect(renameComponent('button1', 'def')).toMatch(/reservada/)
    expect(renameComponent('button1', 'form')).toMatch(/reservada/)
    expect(renameComponent('button1', 'label1')).toMatch(/Já existe/)
    expect(useIde.getState().dirty).toBe(false)
    expect(useIde.getState().currentDoc()?.children.map((c) => c.id)).toEqual(['button1', 'label1'])
  })

  it('renameComponent troca o ID, acompanha a seleção e entra no histórico', () => {
    expect(useIde.getState().renameComponent('button1', 'btnOk')).toBeNull()
    expect(useIde.getState().selection).toEqual(['btnOk'])
    expect(useIde.getState().currentDoc()?.children[0].id).toBe('btnOk')
    expect(useIde.getState().dirty).toBe(true)
    useIde.getState().undo()
    expect(useIde.getState().currentDoc()?.children[0].id).toBe('button1')
    expect(useIde.getState().selection).toEqual(['button1']) // a seleção acompanha o ID ao desfazer
    useIde.getState().redo()
    expect(useIde.getState().selection).toEqual(['btnOk']) // ...e ao refazer
  })

  it('renomeios em sequência são seguidos na ordem certa ao desfazer', () => {
    const s = useIde.getState()
    s.renameComponent('button1', 'a')
    s.renameComponent('a', 'b')
    useIde.getState().undo()
    expect(useIde.getState().selection).toEqual(['a'])
    useIde.getState().undo()
    expect(useIde.getState().selection).toEqual(['button1'])
  })

  it('setProp e setFormProps editam o documento ativo', () => {
    useIde.getState().setProp('button1', 'text', 'Salvar')
    useIde.getState().setFormProps({ title: 'Meu form' })
    const doc = useIde.getState().currentDoc()!
    expect(doc.children[0].props.text).toBe('Salvar')
    expect(doc.title).toBe('Meu form')
  })

  it('o seletor de cor agrupa as edições com o mesmo txn em um único desfazer', () => {
    const { setProp: set } = useIde.getState()
    for (const c of ['#ff0000', '#ee0000', '#dd0000']) set('button1', 'background', c, 'color-1')
    expect(useIde.getState().currentDoc()?.children[0].props.background).toBe('#dd0000')
    useIde.getState().undo()
    expect('background' in useIde.getState().currentDoc()!.children[0].props).toBe(false)
  })
})
