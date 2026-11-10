import { describe, expect, it } from 'vitest'
import { FORM_SCHEMA_VERSION, newFormDocument } from '../../src/shared/project'
import { isUid, newUid } from '../../src/shared/uid'
import { parseFormDocumentEx, serializeForm } from '../../src/renderer/src/core/model'
import { createNode, addNode, duplicateNodes, pasteNodes, renameNode, deleteNodes } from '../../src/renderer/src/core/commands'
import { createTracked, mutate, undo, redo } from '../../src/renderer/src/core/history'
import { locateByUid, walk } from '../../src/renderer/src/core/tree'
import { validateForm } from '../../src/renderer/src/core/validate'

const v1 = (children: unknown): string =>
  JSON.stringify({ format: 'vform-form', version: 1, name: 'Main', title: 'Main', width: 640, height: 480, children })
const node = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, type: 'Button', x: 0, y: 0, width: 96, height: 30, props: { text: id }, ...extra })

function uidsOf(doc: { children: never[] }): string[] {
  const out: string[] = []
  walk(doc, (n) => out.push(n.uid))
  return out
}

describe('uid', () => {
  it('newUid gera UUIDs válidos e únicos', () => {
    const a = newUid()
    expect(isUid(a)).toBe(true)
    expect(newUid()).not.toBe(a)
    expect(isUid('abc')).toBe(false)
    expect(isUid(5)).toBe(false)
  })

  it('migra um formulário da versão 1: todo componente (inclusive aninhado) ganha um uid único; o resto fica igual', () => {
    const p = parseFormDocumentEx(v1([node('a'), node('pnl', { type: 'Panel', props: {}, children: [node('b')] })]))
    expect(p.fromVersion).toBe(1)
    expect(p.upgraded).toBe(true)
    expect(p.doc.version).toBe(FORM_SCHEMA_VERSION)
    const uids = uidsOf(p.doc as never)
    expect(uids).toHaveLength(3)
    expect(new Set(uids).size).toBe(3)
    expect(uids.every(isUid)).toBe(true)
    expect(p.doc.children[1].children?.[0]).toMatchObject({ id: 'b', props: { text: 'b' } })
  })

  it('o uid vai primeiro no arquivo e sobrevive a salvar e reabrir (sem nova migração)', () => {
    const doc = { ...newFormDocument('Main'), children: [] as ReturnType<typeof createNode>[] } as never as ReturnType<typeof newFormDocument>
    const n = createNode(doc, 'Button', 10, 10)!
    addNode(doc, null, n)
    const text = serializeForm(doc)
    expect(text.indexOf('"uid"')).toBeLessThan(text.indexOf('"id"'))
    const back = parseFormDocumentEx(text)
    expect(back.upgraded).toBe(false)
    expect(back.doc.children[0].uid).toBe(n.uid)
  })

  it('uid repetido, malformado ou ausente num arquivo da versão atual é refeito (e avisado)', () => {
    const u = newUid()
    const text = JSON.stringify({ ...JSON.parse(v1([])), version: 2, children: [node('a', { uid: u }), node('b', { uid: u }), node('c', { uid: 'xx' }), node('d')] })
    const p = parseFormDocumentEx(text)
    expect(p.upgraded).toBe(true)
    expect(p.repairedUids).toBe(3)
    const uids = uidsOf(p.doc as never)
    expect(new Set(uids).size).toBe(4)
    expect(p.doc.children[0].uid).toBe(u) // o primeiro mantém
  })

  it('renomear o ID não muda o uid; desfazer e refazer também não', () => {
    const base = newFormDocument('Main')
    const n = createNode(base, 'Button', 0, 0)!
    addNode(base, null, n)
    const uid = n.uid
    let t = createTracked(base)
    t = mutate(t, (d) => renameNode(d, 'button1', 'btnSalvar'), undefined, [['button1', 'btnSalvar']])
    expect(t.doc.children[0]).toMatchObject({ id: 'btnSalvar', uid })
    t = undo(t)
    expect(t.doc.children[0]).toMatchObject({ id: 'button1', uid })
    t = redo(t)
    expect(t.doc.children[0]).toMatchObject({ id: 'btnSalvar', uid })
    expect(locateByUid(t.doc, uid)?.node.id).toBe('btnSalvar')
  })

  it('duplicar e colar geram uids novos (também nos filhos); recortar e desfazer mantêm o original', () => {
    const doc = newFormDocument('Main')
    const pnl = createNode(doc, 'Panel', 0, 0)!
    addNode(doc, null, pnl)
    const child = createNode(doc, 'Button', 4, 4)!
    addNode(doc, pnl.id, child)
    const before = new Set(uidsOf(doc as never))
    const created = duplicateNodes(doc, [pnl.id])
    expect(created).toHaveLength(1)
    const after = uidsOf(doc as never)
    expect(new Set(after).size).toBe(after.length) // nenhuma repetição
    expect(after.length).toBe(before.size + 2)
    const clip = JSON.parse(JSON.stringify([doc.children[0]]))
    pasteNodes(doc, null, clip)
    const all = uidsOf(doc as never)
    expect(new Set(all).size).toBe(all.length)

    const t0 = createTracked(doc)
    const uid = doc.children[0].uid
    const t1 = mutate(t0, (d) => deleteNodes(d, [d.children[0].id]))
    expect(undo(t1).doc.children[0].uid).toBe(uid)
  })

  it('validateForm acusa uid ausente e repetido', () => {
    const doc = newFormDocument('Main')
    const a = createNode(doc, 'Button', 0, 0)!
    addNode(doc, null, a)
    const b = { ...createNode(doc, 'Label', 0, 40)!, uid: a.uid }
    addNode(doc, null, b)
    expect(validateForm(doc).some((i) => /repetida/.test(i.message))).toBe(true)
    const c = { ...createNode(doc, 'Label', 0, 80)!, uid: '' }
    addNode(doc, null, c)
    expect(validateForm(doc).some((i) => /ausente ou inválida/.test(i.message))).toBe(true)
  })
})
