import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newFormDocument, type FormDocument, type FormNode } from '@shared/project'
import { DEFAULT_SETTINGS, normalizeSettings } from '@shared/settings'
import { alignNodes, canAlign, canDistribute, distributeNodes } from '@renderer/core/align'
import { clampRect, contentSize, minContentSize } from '@renderer/core/bounds'
import { addNode, createNode, pasteNodes, setFormProps, setProp, setRects } from '@renderer/core/commands'
import { GUIDE_THRESHOLD, linesOf, snapToGuides } from '@renderer/core/guides'
import { createTracked, mutate } from '@renderer/core/history'
import { locate } from '@renderer/core/tree'
import { useIde } from '@renderer/store'

const apply = (doc: FormDocument, recipe: (d: FormDocument) => void): FormDocument => mutate(createTracked(doc), recipe).doc

/** Formulário 640x480 com os componentes dados: [tipo, id, x, y, largura, altura, pai?]. */
function build(specs: [string, string, number, number, number, number, string?][]): FormDocument {
  let doc = newFormDocument('Main')
  for (const [type, id, x, y, w, h, parent] of specs) {
    doc = apply(doc, (d) => {
      const node = createNode(d, type, 0, 0)!
      node.id = id
      addNode(d, parent ?? null, node)
      setRects(d, { [id]: { x, y, width: w, height: h } })
    })
  }
  return doc
}

const pos = (doc: FormDocument, id: string): [number, number] => {
  const n = locate(doc, id)!.node
  return [n.x, n.y]
}

describe('limites (bounds)', () => {
  const doc = build([
    ['Panel', 'p', 20, 20, 200, 100],
    ['Tabs', 't', 300, 20, 200, 124]
  ])

  it('a área dos filhos: o formulário, o container, e o Tabs sem o cabeçalho de abas', () => {
    expect(contentSize(doc, null)).toEqual({ width: 640, height: 480 })
    expect(contentSize(doc, 'p')).toEqual({ width: 200, height: 100 })
    expect(contentSize(doc, 't')).toEqual({ width: 200, height: 100 }) // 124 - 24 de cabeçalho
    expect(contentSize(doc, 'inexistente')).toEqual({ width: 640, height: 480 })
  })

  it('clampRect empurra para dentro e encolhe o que é maior que a área', () => {
    const area = { width: 200, height: 100 }
    expect(clampRect({ x: 180, y: 90, width: 50, height: 30 }, area)).toEqual({ x: 150, y: 70, width: 50, height: 30 })
    expect(clampRect({ x: -10, y: -5, width: 50, height: 30 }, area)).toEqual({ x: 0, y: 0, width: 50, height: 30 })
    expect(clampRect({ x: 20, y: 10, width: 500, height: 300 }, area)).toEqual({ x: 0, y: 0, width: 200, height: 100 })
  })

  it('o menor tamanho que ainda contém os filhos (sem mínimo em auto-layout)', () => {
    const full = build([
      ['Panel', 'p', 0, 0, 300, 200],
      ['Button', 'a', 10, 10, 100, 30, 'p'],
      ['Button', 'b', 150, 80, 100, 30, 'p']
    ])
    const p = locate(full, 'p')!.node
    expect(minContentSize(p.children!, p)).toEqual({ width: 250, height: 110 })
    expect(minContentSize(full.children, null)).toEqual({ width: 300, height: 200 })
    const auto = apply(full, (d) => setProp(d, 'p', 'layout', 'vertical'))
    expect(minContentSize(locate(auto, 'p')!.node.children!, locate(auto, 'p')!.node)).toEqual({ width: 0, height: 0 })
  })

  it('o formulário nunca fica menor que os componentes, nem maior que 4000', () => {
    const d = build([['Button', 'a', 500, 400, 100, 30]])
    const smaller = apply(d, (x) => setFormProps(x, { width: 200, height: 100 }))
    expect([smaller.width, smaller.height]).toEqual([600, 430])
    const huge = apply(d, (x) => setFormProps(x, { width: 99999 }))
    expect(huge.width).toBe(4000)
    expect(apply(newFormDocument('X'), (x) => setFormProps(x, { width: 10 })).width).toBe(100)
  })
})

describe('alinhar e distribuir', () => {
  const doc = build([
    ['Button', 'a', 20, 40, 100, 30],
    ['Button', 'b', 200, 100, 60, 20],
    ['Button', 'c', 400, 10, 80, 50]
  ])
  const ids = ['a', 'b', 'c']

  it('alinha pela caixa que envolve todos os selecionados', () => {
    // caixa: x 20..480, y 10..120
    expect(pos(apply(doc, (d) => alignNodes(d, ids, 'left')), 'c')).toEqual([20, 10])
    expect(pos(apply(doc, (d) => alignNodes(d, ids, 'right')), 'a')).toEqual([380, 40]) // 480 - 100
    expect(pos(apply(doc, (d) => alignNodes(d, ids, 'hcenter')), 'b')).toEqual([220, 100]) // (20+480-60)/2
    expect(pos(apply(doc, (d) => alignNodes(d, ids, 'top')), 'a')).toEqual([20, 10])
    expect(pos(apply(doc, (d) => alignNodes(d, ids, 'bottom')), 'a')).toEqual([20, 90]) // 120 - 30
    expect(pos(apply(doc, (d) => alignNodes(d, ids, 'vmiddle')), 'c')).toEqual([400, 40]) // (10+120-50)/2
  })

  it('um componente sozinho alinha à área do pai', () => {
    expect(pos(apply(doc, (d) => alignNodes(d, ['a'], 'right')), 'a')).toEqual([540, 40]) // 640 - 100
    expect(pos(apply(doc, (d) => alignNodes(d, ['a'], 'bottom')), 'a')).toEqual([20, 450]) // 480 - 30
    expect(pos(apply(doc, (d) => alignNodes(d, ['b'], 'hcenter')), 'b')).toEqual([290, 100])
  })

  it('distribui com espaços iguais, mantendo o primeiro e o último no lugar', () => {
    const h = apply(doc, (d) => distributeNodes(d, ids, 'h'))
    // larguras 100+60+80 = 240; vão de 20 a 480 = 460; sobra 220 → 110 de espaço
    expect(pos(h, 'a')[0]).toBe(20)
    expect(pos(h, 'b')[0]).toBe(230) // 120 + 110
    expect(pos(h, 'c')[0]).toBe(400)
    const v = apply(doc, (d) => distributeNodes(d, ids, 'v'))
    // por y: c(10,h50) a(40,h30) b(100,h20): vão 10..120, alturas 100, sobra 10 → espaço 5
    expect(pos(v, 'c')[1]).toBe(10)
    expect(pos(v, 'a')[1]).toBe(65) // 60 + 5
    expect(pos(v, 'b')[1]).toBe(100)
  })

  it('só alinha irmãos de um pai posicionado à mão; distribuir exige 3 ou mais', () => {
    const nested = build([
      ['Panel', 'p', 0, 0, 300, 200],
      ['Button', 'in1', 10, 10, 50, 20, 'p'],
      ['Button', 'in2', 80, 50, 50, 20, 'p'],
      ['Button', 'out', 400, 10, 50, 20]
    ])
    expect(canAlign(nested, ['in1', 'in2'])).toBe(true)
    expect(canAlign(nested, ['in1', 'out'])).toBe(false) // pais diferentes
    expect(canAlign(nested, [])).toBe(false)
    expect(canDistribute(nested, ['in1', 'in2'])).toBe(false)
    expect(canDistribute(doc, ids)).toBe(true)
    const auto = apply(nested, (d) => setProp(d, 'p', 'layout', 'vertical'))
    expect(canAlign(auto, ['in1', 'in2'])).toBe(false) // o Panel posiciona sozinho
    expect(apply(auto, (d) => alignNodes(d, ['in1', 'in2'], 'left'))).toBe(auto)
  })

  it('selecionar o container e o filho alinha só o container (o filho vai junto)', () => {
    const nested = build([
      ['Panel', 'p', 100, 100, 200, 100],
      ['Button', 'in', 10, 10, 50, 20, 'p']
    ])
    const r = apply(nested, (d) => alignNodes(d, ['p', 'in'], 'left'))
    expect(pos(r, 'p')).toEqual([0, 100])
    expect(pos(r, 'in')).toEqual([10, 10])
  })
})

describe('guias inteligentes (snapToGuides)', () => {
  const target = { x: 100, y: 200, width: 80, height: 40 } // linhas x: 100 140 180 | y: 200 220 240

  it('gruda a borda esquerda na do vizinho e mostra a linha', () => {
    const r = snapToGuides(linesOf({ x: 103, y: 0, width: 50, height: 20 }), [target])
    expect(r.dx).toBe(-3)
    expect(r.dy).toBe(0)
    expect(r.v).toEqual([100])
    expect(r.h).toEqual([])
  })

  it('o centro do que se move pode grudar no centro do vizinho (e vale nos dois eixos)', () => {
    const r = snapToGuides(linesOf({ x: 120, y: 213, width: 40, height: 14 }), [target]) // centro x 140, y 220
    expect(r).toMatchObject({ dx: 0, dy: 0, v: [140], h: [220] })
  })

  it('fora do limite não gruda; o mais próximo vence', () => {
    expect(snapToGuides(linesOf({ x: 100 + GUIDE_THRESHOLD + 1, y: 0, width: 10, height: 10 }), [target]).dx).toBe(0)
    const r = snapToGuides({ x: [98, 104], y: [] }, [target]) // 98 está a 2 de 100; 104 a 4
    expect(r.dx).toBe(2)
  })

  it('mostra todas as linhas que ficam alinhadas depois do ajuste, de vários vizinhos', () => {
    const other = { x: 100, y: 300, width: 30, height: 30 }
    const r = snapToGuides(linesOf({ x: 101, y: 0, width: 20, height: 10 }), [target, other])
    expect(r.v).toEqual([100]) // a mesma linha de dois vizinhos aparece uma só vez
  })

  it('sem alvos ou sem linhas, nada muda', () => {
    expect(snapToGuides(linesOf({ x: 5, y: 5, width: 5, height: 5 }), [])).toEqual({ dx: 0, dy: 0, v: [], h: [] })
    expect(snapToGuides({ x: [], y: [] }, [target])).toEqual({ dx: 0, dy: 0, v: [], h: [] })
  })
})

describe('colar (pasteNodes)', () => {
  const src: FormNode[] = [
    { id: 'btn', type: 'Button', x: 600, y: 440, width: 100, height: 30, props: { text: 'Ok' } },
    { id: 'pnl', type: 'Panel', x: 10, y: 10, width: 200, height: 100, props: {}, children: [{ id: 'inner', type: 'Label', x: 5, y: 5, width: 50, height: 20, props: {} }] }
  ]
  const doc = build([['Button', 'btn', 0, 0, 100, 30]])

  it('gera IDs novos (também nos filhos), desloca e mantém dentro do formulário', () => {
    const next = apply(doc, (d) => {
      expect(pasteNodes(d, null, src)).toEqual(['button1', 'panel1'])
    })
    expect(pos(next, 'button1')).toEqual([540, 450]) // 616/456 empurrado para dentro (640-100, 480-30)
    expect(pos(next, 'panel1')).toEqual([26, 26])
    expect(locate(next, 'panel1')!.node.children![0].id).toBe('label1')
    expect(locate(next, 'btn')).not.toBeNull() // o original continua
  })

  it('cola dentro de um container (ou no formulário se o pai não for container)', () => {
    const withPanel = build([['Panel', 'host', 50, 50, 300, 200], ['Button', 'leaf', 0, 0, 40, 20]])
    const a = apply(withPanel, (d) => void pasteNodes(d, 'host', [src[0]]))
    expect(locate(a, 'button1')!.parent!.id).toBe('host')
    const b = apply(withPanel, (d) => void pasteNodes(d, 'leaf', [src[0]]))
    expect(locate(b, 'button1')!.parent).toBeNull()
  })

  it('num Tabs a cópia vai para a aba selecionada', () => {
    const tabs = apply(build([['Tabs', 'abas', 0, 0, 300, 200]]), (d) => setProp(d, 'abas', 'selectedIndex', 1))
    const r = apply(tabs, (d) => void pasteNodes(d, 'abas', [src[0]]))
    expect(locate(r, 'button1')!.node.tab).toBe(1)
  })

  it('não altera os componentes de origem', () => {
    const before = JSON.stringify(src)
    apply(doc, (d) => void pasteNodes(d, null, src))
    expect(JSON.stringify(src)).toBe(before)
  })
})

describe('store: copiar, colar, limites e alinhar', () => {
  beforeEach(() => {
    const doc = build([
      ['Button', 'btn', 100, 100, 100, 30],
      ['Panel', 'pnl', 300, 100, 200, 150],
      ['Label', 'lbl', 100, 200, 80, 20]
    ])
    useIde.setState({
      tracked: { Main: createTracked(doc), Outro: createTracked(newFormDocument('Outro')) },
      activeForm: 'Main',
      selection: ['btn'],
      clipboard: null,
      pasteCount: 0,
      dirty: false
    })
  })
  const ids = (): string[] => useIde.getState().currentDoc()!.children.map((c) => c.id)

  it('copiar e colar: cola ao lado, seleciona a cópia e cada colagem se desloca mais', () => {
    useIde.getState().copySelection()
    useIde.getState().pasteClipboard()
    expect(ids()).toContain('button1')
    expect(useIde.getState().selection).toEqual(['button1'])
    expect(pos(useIde.getState().currentDoc()!, 'button1')).toEqual([116, 116])
    useIde.getState().pasteClipboard()
    expect(pos(useIde.getState().currentDoc()!, 'button2')).toEqual([132, 132]) // 2ª colagem: +32
    expect(locate(useIde.getState().currentDoc()!, 'btn')).not.toBeNull()
  })

  it('com um container selecionado, cola dentro dele', () => {
    useIde.getState().copySelection() // btn
    useIde.setState({ selection: ['pnl'] })
    useIde.getState().pasteClipboard()
    expect(locate(useIde.getState().currentDoc()!, 'button1')!.parent!.id).toBe('pnl')
  })

  it('recortar remove o original; colar em OUTRO formulário gera IDs para ele', () => {
    useIde.getState().cutSelection()
    expect(ids()).not.toContain('btn')
    useIde.setState({ activeForm: 'Outro', selection: [] })
    useIde.getState().pasteClipboard()
    expect(useIde.getState().currentDoc()!.children.map((c) => c.id)).toEqual(['button1'])
  })

  it('colar sem nada copiado, ou copiar sem seleção, não faz nada', () => {
    useIde.getState().pasteClipboard()
    expect(ids()).toEqual(['btn', 'pnl', 'lbl'])
    useIde.setState({ selection: [] })
    useIde.getState().copySelection()
    expect(useIde.getState().clipboard).toBeNull()
  })

  it('posição e tamanho digitados nunca deixam o componente sair do formulário', () => {
    useIde.getState().setNodeRect('btn', { x: 9999 })
    expect(pos(useIde.getState().currentDoc()!, 'btn')[0]).toBe(540) // 640 - 100
    useIde.getState().setNodeRect('btn', { y: -50, width: 5000 })
    const n = locate(useIde.getState().currentDoc()!, 'btn')!.node
    expect([n.y, n.width]).toEqual([0, 640])
  })

  it('as setas param na borda do formulário e na do container', () => {
    useIde.setState({ selection: ['btn'] })
    for (let i = 0; i < 700; i++) useIde.getState().nudgeSelection(10, 0)
    expect(pos(useIde.getState().currentDoc()!, 'btn')[0]).toBe(540)
    for (let i = 0; i < 70; i++) useIde.getState().nudgeSelection(-10, -10)
    expect(pos(useIde.getState().currentDoc()!, 'btn')).toEqual([0, 0])
  })

  it('alinhar e distribuir pela store só agem quando é possível', () => {
    useIde.setState({ selection: ['btn', 'lbl'] })
    useIde.getState().alignSelection('left')
    expect(pos(useIde.getState().currentDoc()!, 'lbl')[0]).toBe(100)
    useIde.setState({ selection: ['btn', 'pnl', 'lbl'] })
    useIde.getState().distributeSelection('v')
    expect(useIde.getState().dirty).toBe(true)
    useIde.setState({ selection: ['btn'], dirty: false })
    useIde.getState().distributeSelection('h') // 1 só: nada
    expect(useIde.getState().dirty).toBe(false)
  })

  it('soltar um componente da paleta perto da borda o mantém dentro do formulário', () => {
    useIde.getState().addComponent('Button', null, 630, 470)
    const n = locate(useIde.getState().currentDoc()!, 'button1')!.node
    expect([n.x, n.y]).toEqual([544, 450]) // 640 - 96 (largura padrão do Button), 480 - 30
  })
})

describe('configurações', () => {
  it('valores padrão e leitura tolerante: lixo, tipos errados e chaves desconhecidas são ignorados', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('texto')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({ autosave: 'sim', livePreview: 1, rulers: 'não', lastDir: 42, extra: true })).toEqual({
      autosave: false,
      livePreview: false,
      rulers: true, // só desliga com `false` de verdade
      trustedProjects: [],
      lastDir: undefined
    })
    expect(normalizeSettings({ autosave: true, livePreview: true, rulers: false, lastDir: 'C:\\proj' })).toEqual({
      autosave: true,
      livePreview: true,
      rulers: false,
      trustedProjects: [],
      lastDir: 'C:\\proj'
    })
  })

  it('a store carrega as preferências e grava só a que mudou', async () => {
    const get = vi.fn().mockResolvedValue({ autosave: true, livePreview: false, rulers: true, lastDir: 'C:\\a' })
    const set = vi.fn().mockImplementation(async (patch) => ({ autosave: true, livePreview: false, rulers: true, ...patch }))
    ;(globalThis as unknown as { window: unknown }).window = { vform: { settings: { get, set } } }
    await useIde.getState().loadSettings()
    expect(useIde.getState().settings.autosave).toBe(true)
    await useIde.getState().setSetting('rulers', false)
    expect(set).toHaveBeenCalledWith({ rulers: false })
    expect(useIde.getState().settings.rulers).toBe(false)
  })
})
