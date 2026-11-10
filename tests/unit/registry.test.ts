import { describe, expect, it } from 'vitest'
import { REGISTRY, type PropSpec } from '../../src/shared/registry'
import { CATALOG, CATALOG_BY_TYPE, defaultProps, propDef } from '../../src/renderer/src/components/catalog'
import { membersOf } from '../../src/renderer/src/core/pyapi'
import { buildRunComponents } from '../../src/renderer/src/core/runstate'
import { newFormDocument } from '../../src/shared/project'

function valid(p: PropSpec, v: unknown): boolean {
  switch (p.type) {
    case 'string':
    case 'text':
    case 'color':
      return typeof v === 'string'
    case 'boolean':
      return typeof v === 'boolean'
    case 'number':
      return typeof v === 'number' && (p.min === undefined || v >= p.min) && (p.max === undefined || v <= p.max)
    case 'enum':
      return typeof v === 'string' && (p.options ?? []).includes(v)
    case 'items':
      return Array.isArray(v)
  }
}

describe('Component Registry', () => {
  it('tem tipos únicos, categorias e dimensões válidas', () => {
    const types = REGISTRY.components.map((c) => c.type)
    expect(new Set(types).size).toBe(types.length)
    for (const c of REGISTRY.components) {
      expect(c.category, c.type).toBeTruthy()
      expect(c.width, c.type).toBeGreaterThan(0)
      expect(c.height, c.type).toBeGreaterThan(0)
      expect(c.label, c.type).toBeTruthy()
    }
  })

  it('o valor padrão de cada propriedade respeita o próprio tipo, limites e opções', () => {
    const all = [...Object.values(REGISTRY.commonProps), ...REGISTRY.components.flatMap((c) => c.props)]
    for (const p of all) expect(valid(p, p.default), `${p.key}: padrão ${JSON.stringify(p.default)}`).toBe(true)
  })

  it('propriedades de um tipo não se repetem e as comuns existem', () => {
    for (const c of REGISTRY.components) {
      const keys = c.props.map((p) => p.key)
      expect(new Set(keys).size, c.type).toBe(keys.length)
      for (const k of c.common) expect(REGISTRY.commonProps[k], `${c.type}.${k}`).toBeDefined()
      for (const k of c.common) expect(keys, `${c.type}.${k} duplicada`).not.toContain(k)
    }
  })

  it('métodos e eventos: todo método existe no catálogo de métodos; eventos têm nome e documentação', () => {
    for (const c of REGISTRY.components) {
      for (const m of c.methods) expect(REGISTRY.methods[m], `${c.type}.${m}`).toBeDefined()
      expect(c.events.length, c.type).toBeGreaterThan(0)
      for (const e of c.events) {
        expect(e.name).toMatch(/^[a-z]+(_[a-z]+)*$/)
        expect(e.doc.length).toBeGreaterThan(5)
      }
    }
    for (const [name, m] of Object.entries(REGISTRY.methods)) {
      expect(m.doc.length, name).toBeGreaterThan(5)
      expect(m.detail.startsWith(name), name).toBe(true)
    }
  })

  it('apelidos e item selecionado apontam para propriedades reais', () => {
    for (const c of REGISTRY.components) {
      for (const target of Object.values(c.aliases ?? {})) expect(c.props.some((p) => p.key === target), `${c.type} → ${target}`).toBe(true)
      if (c.selectedItem) {
        expect(c.props.some((p) => p.key === 'items')).toBe(true)
        expect(c.props.some((p) => p.key === 'selectedIndex')).toBe(true)
      }
    }
  })

  it('catálogo, propriedades padrão, autocompletar e execução saem do registro', () => {
    expect(CATALOG.map((c) => c.type)).toEqual(REGISTRY.components.map((c) => c.type))
    for (const c of REGISTRY.components) {
      expect(Object.keys(defaultProps(c.type))).toEqual(c.props.map((p) => p.key))
      for (const p of c.props) expect(propDef(c.type, p.key)).toEqual(p)
      const names = membersOf(c.type).map((m) => m.name)
      for (const m of c.methods) expect(names, `${c.type} método ${m}`).toContain(m)
      for (const e of c.events) expect(names).toContain(`on_${e.name}`)
      for (const alias of Object.keys(c.aliases ?? {})) expect(names).toContain(alias)
      for (const key of Object.keys(c.runtimeProps ?? {})) expect(names.length).toBeGreaterThan(0)
    }
    const doc = { ...newFormDocument('F'), children: [{ id: 't', type: 'Table', x: 0, y: 0, width: 10, height: 10, props: {} }] }
    expect(buildRunComponents(doc).t.props).toMatchObject({ rows: [], selectedIndex: -1 })
    expect(CATALOG_BY_TYPE.Panel.container).toBe(true)
  })

  it('todo componente tem texto de ajuda completo (alimenta o dicionário e o manual)', () => {
    for (const c of REGISTRY.components) {
      expect(c.help.resumo.length, c.type).toBeGreaterThan(10)
      expect(c.help.paraQue.length, c.type).toBeGreaterThan(10)
      expect(c.help.exemplo, c.type).toContain('form.')
    }
  })
})
