import { describe, expect, it } from 'vitest'
import { formatIssue, validateManifest } from '../../src/shared/manifest'
import { newFormDocument, type FormDocument } from '../../src/shared/project'
import { newUid } from '../../src/shared/uid'
import { migrateForm } from '../../src/renderer/src/core/migrate'
import { validateForm } from '../../src/renderer/src/core/validate'

const manifest = (forms: unknown[]): unknown => ({ format: 'vform-project', version: 1, name: 'P', forms })
const ref = (name: string): unknown => ({ name, layout: `${name}.form.json`, script: `${name}.py` })

describe('validateManifest', () => {
  it('aceita um projeto normal', () => {
    expect(validateManifest(manifest([ref('Main'), ref('Cadastro')]))).toEqual([])
  })
  it('recusa lixo, formato e versão errados', () => {
    expect(validateManifest(null)[0].message).toMatch(/objeto/)
    expect(validateManifest({ format: 'x', version: 1, name: 'P', forms: [ref('A')] }).some((i) => /Não é um projeto/.test(i.message))).toBe(true)
    expect(validateManifest({ format: 'vform-project', version: 99, name: 'P', forms: [ref('A')] }).some((i) => /versão 99/.test(i.message))).toBe(true)
  })
  it('recusa projeto sem telas, nomes inválidos e repetidos', () => {
    expect(validateManifest(manifest([])).length).toBeGreaterThan(0)
    expect(validateManifest(manifest([ref('2x')])).some((i) => /inválido/.test(i.message))).toBe(true)
    expect(validateManifest(manifest([ref('Main'), ref('main')])).some((i) => /repetido/.test(i.message))).toBe(true)
  })
  it('recusa caminhos absolutos, com .. e extensões erradas', () => {
    const bad = (layout: string, script = 'M.py'): unknown[] => validateManifest(manifest([{ name: 'M', layout, script }]))
    expect(bad('C:/x/M.form.json').length).toBeGreaterThan(0)
    expect(bad('/etc/M.form.json').length).toBeGreaterThan(0)
    expect(bad('../M.form.json').length).toBeGreaterThan(0)
    expect(bad('M.txt').length).toBeGreaterThan(0)
    expect(bad('M.form.json', 'M.exe').length).toBeGreaterThan(0)
  })
  it('recusa dois formulários no mesmo arquivo', () => {
    const r = validateManifest(manifest([{ name: 'A', layout: 'X.form.json', script: 'A.py' }, { name: 'B', layout: 'X.form.json', script: 'B.py' }]))
    expect(r.some((i) => /mais de uma tela/.test(i.message))).toBe(true)
  })
})

function doc(children: FormDocument['children']): FormDocument {
  return { ...newFormDocument('Main'), children }
}
const node = (over: Record<string, unknown>): FormDocument['children'][number] =>
  ({ uid: newUid(), id: 'b1', type: 'Button', x: 0, y: 0, width: 100, height: 30, props: { text: 'Ok' }, ...over }) as FormDocument['children'][number]

describe('validateForm', () => {
  it('formulário normal não tem problemas', () => {
    expect(validateForm(doc([node({})]))).toEqual([])
  })
  it('tipo desconhecido, propriedade com tipo errado e fora do limite são erros com o lugar', () => {
    const r = validateForm(doc([node({ id: 'x', type: 'Foguete' }), node({ id: 'b', props: { text: 5, fontSize: 500, bold: 'sim' } })]), 'Main.form.json')
    const msgs = r.map(formatIssue)
    expect(msgs.some((m) => m.includes('componente x') && m.includes('Foguete'))).toBe(true)
    expect(msgs.some((m) => m.includes('propriedade text'))).toBe(true)
    expect(msgs.some((m) => m.includes('máximo'))).toBe(true)
    expect(msgs.some((m) => m.includes('propriedade bold'))).toBe(true)
    expect(r.every((i) => i.severity === 'error')).toBe(true)
  })
  it('propriedade desconhecida é só aviso', () => {
    const r = validateForm(doc([node({ props: { text: 'a', cor_nova: 1 } })]))
    expect(r).toHaveLength(1)
    expect(r[0].severity).toBe('warning')
  })
  it('tamanho absurdo do formulário e dos componentes', () => {
    expect(validateForm({ ...doc([]), width: 0 }).length).toBe(1)
    expect(validateForm(doc([node({ width: 999999 })])).some((i) => i.severity === 'error')).toBe(true)
  })
  it('aninhamento profundo demais e componentes demais', () => {
    let deep = node({ id: 'leaf', type: 'Panel', props: {}, children: [] })
    for (let i = 0; i < 40; i++) deep = node({ id: `p${i}`, type: 'Panel', props: {}, children: [deep] })
    expect(validateForm(doc([deep])).some((i) => /Aninhamento/.test(i.message))).toBe(true)
    const many = Array.from({ length: 5001 }, (_, i) => node({ id: `n${i}` }))
    expect(validateForm(doc(many)).some((i) => /demais/.test(i.message))).toBe(true)
  })
})

describe('migrateForm', () => {
  it('na versão atual não faz nada', () => {
    const r = migrateForm({ version: 2, name: 'A' })
    expect(r.applied).toEqual([])
    expect(r.doc.name).toBe('A')
  })
  it('aplica os passos em ordem e sobe a versão', () => {
    const r = migrateForm({ version: 1, titulo: 'x' }, 3, {
      1: (d) => ({ ...d, title: d.titulo }),
      2: (d) => ({ ...d, extra: true })
    })
    expect(r.applied).toEqual([1, 2])
    expect(r.doc).toMatchObject({ version: 3, title: 'x', extra: true })
  })
  it('versão futura ou passo ausente é erro explícito', () => {
    expect(() => migrateForm({ version: 5 }, 3)).toThrow(/lê até/)
    expect(() => migrateForm({ version: 1 }, 2, {})).toThrow(/migração/)
  })
})
