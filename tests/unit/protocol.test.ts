import { describe, expect, it } from 'vitest'
import { clampText, LineSplitter, MAX_MESSAGE_CHARS, MAX_PENDING_CHARS, sanitizePatch } from '../../src/main/protocol'

describe('LineSplitter', () => {
  it('junta pedaços e devolve só linhas completas', () => {
    const s = new LineSplitter()
    expect(s.push('{"a":').lines).toEqual([])
    expect(s.push('1}\n{"b":2}\n{"c"').lines).toEqual(['{"a":1}', '{"b":2}'])
    expect(s.push(':3}\n').lines).toEqual(['{"c":3}'])
  })
  it('ignora linhas vazias e descarta linhas acima do limite', () => {
    const s = new LineSplitter()
    const r = s.push(`\n\n${'x'.repeat(MAX_MESSAGE_CHARS + 1)}\nok\n`)
    expect(r.lines).toEqual(['ok'])
    expect(r.dropped).toBe(1)
  })
  it('avisa quando chega lixo demais sem quebra de linha', () => {
    const s = new LineSplitter()
    expect(s.push('y'.repeat(MAX_PENDING_CHARS + 1)).overflow).toBe(true)
    expect(s.push('{"ok":1}\n').lines).toEqual(['{"ok":1}']) // o buffer foi esvaziado
  })
})

describe('sanitizePatch', () => {
  it('mantém alterações válidas e conta as rejeitadas', () => {
    const r = sanitizePatch([
      { id: 'a', prop: 'text', value: 'ok' },
      { id: 'b', prop: 'items', value: ['x', 1, null] },
      { id: 3, prop: 'text', value: 'x' },
      { id: 'c', prop: 'text', value: () => 1 },
      { id: 'd', prop: 'v', value: Number.NaN },
      'lixo'
    ])
    expect(r.changes.map((c) => c.id)).toEqual(['a', 'b'])
    expect(r.rejected).toBe(4)
  })
  it('lista que não é lista vira vazia', () => {
    expect(sanitizePatch('x')).toEqual({ changes: [], rejected: 0 })
  })
})

describe('clampText', () => {
  it('corta textos longos e avisa', () => {
    expect(clampText('abc', 10)).toBe('abc')
    expect(clampText('a'.repeat(30), 10)).toContain('cortado: 20')
  })
})
