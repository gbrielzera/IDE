import { describe, expect, it } from 'vitest'
import { FORM_FORMAT, newFormDocument, type FormDocument } from '@shared/project'
import { addNode, createNode, deleteNodes, duplicateNodes, reparentNodes, setProp, setRects } from '@renderer/core/commands'
import { createTracked, mutate, redo, undo, type Tracked } from '@renderer/core/history'
import { idProblem, isValidId, uniqueId } from '@renderer/core/ids'
import { parseFormDocument, serializeForm } from '@renderer/core/model'
import { absPos, allIds, locate, topmost } from '@renderer/core/tree'

const empty = (): FormDocument => newFormDocument('Main')

/** Aplica uma edição guardando o resultado, como a store faz. */
function edit(t: Tracked, recipe: (d: FormDocument) => void, txn?: string): Tracked {
  return mutate(t, recipe, txn)
}

function withNodes(): Tracked {
  let t = createTracked(empty())
  t = edit(t, (d) => addNode(d, null, createNode(d, 'Panel', 40, 40)!))
  t = edit(t, (d) => addNode(d, 'panel1', createNode(d, 'Button', 8, 8)!))
  t = edit(t, (d) => addNode(d, null, createNode(d, 'TextField', 300, 10)!))
  return t
}

describe('ids', () => {
  it('gera IDs únicos a partir do tipo', () => {
    expect(uniqueId('Button', new Set())).toBe('button1')
    expect(uniqueId('Button', new Set(['button1', 'button2']))).toBe('button3')
    expect(uniqueId('TextField', new Set(['button1']))).toBe('textField1')
  })

  it('valida identificadores Python', () => {
    for (const ok of ['txtNome', '_x', 'btn_ok2', 'ação']) expect(isValidId(ok)).toBe(true)
    for (const bad of ['', '1abc', 'a-b', 'a b', 'class', 'None', 'form', 'a.b'])
      expect(idProblem(bad), bad).not.toBeNull()
  })
})

describe('comandos', () => {
  it('adiciona em container e cai no formulário se o pai não for container', () => {
    const t = withNodes()
    expect(locate(t.doc, 'button1')?.parent?.id).toBe('panel1')
    const t2 = edit(t, (d) => addNode(d, 'textField1', createNode(d, 'Label', 0, 0)!))
    expect(locate(t2.doc, 'label1')?.parent).toBeNull()
  })

  it('cria nós com tamanho padrão, posição não negativa e props independentes', () => {
    const d = empty()
    const a = createNode(d, 'ComboBox', -5, 3.6)!
    const b = createNode(d, 'ComboBox', 0, 0)!
    expect(a).toMatchObject({ x: 0, y: 4, width: 160, height: 28 })
    ;(a.props.items as string[]).push('X')
    expect(b.props.items).toEqual(['Item 1', 'Item 2'])
    expect(createNode(d, 'Inexistente', 0, 0)).toBeNull()
  })

  it('setRects respeita o tamanho mínimo e setProp altera a propriedade', () => {
    let t = withNodes()
    t = edit(t, (d) => setRects(d, { button1: { width: 1, height: 1, x: 12 } }))
    t = edit(t, (d) => setProp(d, 'button1', 'text', 'OK'))
    expect(locate(t.doc, 'button1')?.node).toMatchObject({ x: 12, width: 8, height: 8, props: { text: 'OK' } })
  })

  it('exclui nós e seus filhos', () => {
    const t = edit(withNodes(), (d) => deleteNodes(d, ['panel1', 'button1']))
    expect(allIds(t.doc)).toEqual(new Set(['textField1']))
  })

  it('duplica com IDs novos (inclusive nos filhos) e desloca a cópia', () => {
    const t = edit(withNodes(), (d) => {
      expect(duplicateNodes(d, ['panel1'])).toEqual(['panel2'])
    })
    expect(locate(t.doc, 'panel2')?.node).toMatchObject({ x: 56, y: 56 })
    expect(locate(t.doc, 'panel2')?.node.children?.map((c) => c.id)).toEqual(['button2'])
    expect(allIds(t.doc).size).toBe(5)
  })

  it('reparent mantém a posição visual e limita ao novo pai', () => {
    let t = withNodes()
    expect(absPos(t.doc, 'button1')).toEqual({ x: 48, y: 48 })
    t = edit(t, (d) => reparentNodes(d, ['button1'], null))
    expect(locate(t.doc, 'button1')).toMatchObject({ parent: null, node: { x: 48, y: 48 } })
    t = edit(t, (d) => reparentNodes(d, ['button1'], 'panel1'))
    expect(locate(t.doc, 'button1')).toMatchObject({ parent: { id: 'panel1' }, node: { x: 8, y: 8 } })

    // Fora dos limites do painel (240x160): é puxado para dentro.
    t = edit(t, (d) => setRects(d, { button1: { x: 400, y: 400 } }))
    t = edit(t, (d) => reparentNodes(d, ['button1'], null))
    t = edit(t, (d) => setRects(d, { textField1: { x: 0, y: 0 } }))
    t = edit(t, (d) => reparentNodes(d, ['textField1'], 'panel1'))
    expect(locate(t.doc, 'textField1')?.node).toMatchObject({ x: 0, y: 0 })
  })

  it('não move um container para dentro de si mesmo nem para um não-container', () => {
    const t = withNodes()
    const t2 = edit(t, (d) => reparentNodes(d, ['panel1'], 'panel1'))
    const t3 = edit(t, (d) => reparentNodes(d, ['textField1'], 'button1'))
    expect(t2.doc).toBe(t.doc)
    expect(t3.doc).toBe(t.doc)
  })

  it('topmost ignora descendentes de nós também selecionados e IDs inexistentes', () => {
    const t = withNodes()
    expect(topmost(t.doc, ['button1', 'panel1', 'textField1', 'fantasma'])).toEqual(['panel1', 'textField1'])
  })
})

describe('histórico', () => {
  it('desfaz e refaz de forma simétrica', () => {
    const t0 = withNodes()
    const t1 = edit(t0, (d) => deleteNodes(d, ['panel1']))
    expect(allIds(t1.doc)).toEqual(new Set(['textField1']))
    const back = undo(t1)
    expect(back.doc).toEqual(t0.doc)
    expect(redo(back).doc).toEqual(t1.doc)
  })

  it('desfazer tudo volta ao documento inicial', () => {
    let t = withNodes()
    t = edit(t, (d) => setRects(d, { textField1: { x: 99 } }))
    t = edit(t, (d) => {
      duplicateNodes(d, ['textField1'])
    })
    while (t.undo.length > 0) t = undo(t)
    expect(t.doc).toEqual(empty())
  })

  it('uma nova edição limpa o refazer', () => {
    let t = undo(withNodes())
    expect(t.redo).toHaveLength(1)
    t = edit(t, (d) => setProp(d, 'panel1', 'x', 1))
    expect(t.redo).toHaveLength(0)
  })

  it('agrupa edições com o mesmo txn numa única entrada (arraste)', () => {
    let t = withNodes()
    const before = t.undo.length
    for (const x of [10, 20, 30]) t = edit(t, (d) => setRects(d, { textField1: { x } }), 'move-1')
    expect(t.undo).toHaveLength(before + 1)
    expect(locate(t.doc, 'textField1')?.node.x).toBe(30)
    t = undo(t)
    expect(locate(t.doc, 'textField1')?.node.x).toBe(300)
    t = edit(t, (d) => setRects(d, { textField1: { x: 5 } }), 'move-2')
    expect(t.undo).toHaveLength(before + 1)
  })

  it('ignora edições que não mudam nada', () => {
    const t = withNodes()
    expect(edit(t, (d) => setRects(d, { textField1: { x: 300 } }))).toBe(t)
  })
})

describe('modelo', () => {
  it('serializa e lê de volta sem perdas', () => {
    const t = withNodes()
    expect(parseFormDocument(serializeForm(t.doc))).toEqual(t.doc)
  })

  it('rejeita arquivos inválidos com mensagem clara', () => {
    const doc = (children: unknown[]): string => JSON.stringify({ ...empty(), children })
    const node = { id: 'a', type: 'Label', x: 0, y: 0, width: 10, height: 10 }
    expect(() => parseFormDocument('{"format":"outro"}')).toThrow(/não é um formulário/)
    expect(() => parseFormDocument(JSON.stringify({ ...empty(), version: 99 }))).toThrow(/versão 99/)
    expect(() => parseFormDocument(doc([node, node]))).toThrow(/duplicado/)
    expect(() => parseFormDocument(doc([{ ...node, id: 'class' }]))).toThrow(/reservada/)
    expect(() => parseFormDocument(doc([{ ...node, x: 'a' }]))).toThrow(/número/)
    expect(() => parseFormDocument(doc([{ id: 'b' }]))).toThrow(/type/)
  })

  it('preenche padrões quando faltam campos opcionais', () => {
    const d = parseFormDocument(JSON.stringify({ format: FORM_FORMAT, name: 'X' }))
    expect(d).toMatchObject({ name: 'X', title: 'X', width: 640, height: 480, children: [] })
  })
})
