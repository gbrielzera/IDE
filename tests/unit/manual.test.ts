import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/renderer/src/components/catalog'
import { APP_MEMBERS, EVENTS, membersOf } from '../../src/renderer/src/core/pyapi'
import { ATALHOS, COMPONENT_HELP, GUIDES } from '../../src/renderer/src/core/glossary'
import { encint } from '../../tools/manual/chm'
import { manualBytes, MANUAL_PATH } from '../../tools/manual/build'
import { buildPages } from '../../tools/manual/pages'

describe('manual e dicionário sempre em dia', () => {
  it('o VForm.chm publicado é igual ao gerado agora (se falhar: rode `npm run manual` e comite docs/VForm.chm)', () => {
    const path = join(process.cwd(), MANUAL_PATH)
    expect(existsSync(path), 'docs/VForm.chm não existe: rode `npm run manual`').toBe(true)
    expect(readFileSync(path).equals(manualBytes()), 'o manual está desatualizado: rode `npm run manual`').toBe(true)
  })

  it('todo componente do catálogo tem texto no glossário e página no manual', () => {
    const files = buildPages().map((p) => p.file)
    for (const c of CATALOG) {
      expect(COMPONENT_HELP[c.type], `glossário sem ${c.type}`).toBeDefined()
      expect(files, `manual sem página de ${c.type}`).toContain(`componente-${c.type.toLowerCase()}.html`)
    }
  })

  it('todo evento, método e membro do app está documentado', () => {
    for (const m of APP_MEMBERS) expect(m.doc, `app.${m.name} sem doc`).toBeTruthy()
    for (const c of CATALOG) {
      for (const e of EVENTS[c.type] ?? []) expect(membersOf(c.type).some((m) => m.name === `on_${e}`)).toBe(true)
      for (const m of membersOf(c.type)) expect(m.doc, `${c.type}.${m.name} sem doc`).toBeTruthy()
    }
  })

  it('os guias e atalhos principais existem', () => {
    const ids = GUIDES.map((g) => g.id)
    for (const id of ['primeiros-passos', 'telas', 'editar-texto', 'codigo', 'executar', 'logs']) expect(ids).toContain(id)
    expect(ATALHOS.map((a) => a.teclas)).toEqual(expect.arrayContaining(['F1', 'F2', 'F5']))
  })

  it('o CHM tem o formato esperado (cabeçalho ITSF, diretório ITSP com bloco PMGL)', () => {
    const b = manualBytes()
    expect(b.subarray(0, 4).toString()).toBe('ITSF')
    expect(b.readUInt32LE(4)).toBe(3)
    expect(b.readBigUInt64LE(0x58)).toBeLessThan(BigInt(b.length))
    expect(b.subarray(0x78, 0x7c).toString()).toBe('ITSP')
    expect(b.subarray(0x78 + 0x54, 0x78 + 0x58).toString()).toBe('PMGL')
  })

  it('encint codifica inteiros de tamanho variável', () => {
    expect([...encint(0)]).toEqual([0])
    expect([...encint(127)]).toEqual([127])
    expect([...encint(128)]).toEqual([0x81, 0])
    expect([...encint(300)]).toEqual([0x82, 0x2c])
  })
})
