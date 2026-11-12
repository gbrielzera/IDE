import { describe, expect, it } from 'vitest'
import { clamp, formatNumber, percentOf, rangeOf, safeUrl } from '../../src/renderer/src/components/numeric'

describe('contas dos componentes numéricos', () => {
  it('faixa: máximo menor que o mínimo vale o mínimo; valores ausentes usam 0 a 100', () => {
    expect(rangeOf({})).toEqual({ min: 0, max: 100 })
    expect(rangeOf({ minValue: 10, maxValue: 5 })).toEqual({ min: 10, max: 10 })
  })
  it('porcentagem fica entre 0 e 100 e não divide por zero', () => {
    expect(percentOf({ value: 50 })).toBe(50)
    expect(percentOf({ value: 500 })).toBe(100)
    expect(percentOf({ value: -3 })).toBe(0)
    expect(percentOf({ value: 5, minValue: 5, maxValue: 5 })).toBe(0)
    expect(percentOf({ value: 15, minValue: 10, maxValue: 20 })).toBe(50)
  })
  it('formata com as casas pedidas (limitadas a 0..6)', () => {
    expect(formatNumber(3, 0)).toBe('3')
    expect(formatNumber(3.14159, 2)).toBe('3.14')
    expect(formatNumber(1, 99)).toBe('1.000000')
    expect(formatNumber('x', 1)).toBe('0.0')
    expect(clamp(7, 0, 5)).toBe(5)
  })
})

describe('safeUrl (Link)', () => {
  it('aceita http, https e mailto', () => {
    expect(safeUrl('https://www.python.org')).toBe('https://www.python.org/')
    expect(safeUrl(' http://exemplo.com/a?b=1 ')).toBe('http://exemplo.com/a?b=1')
    expect(safeUrl('mailto:ana@exemplo.com')).toBe('mailto:ana@exemplo.com')
  })
  it('recusa arquivos, scripts, protocolos de app, vazio e lixo', () => {
    for (const bad of ['file:///C:/x.exe', 'javascript:alert(1)', 'data:text/html,x', 'ms-settings:', 'C:/x.exe', '', '   ', 'não é url', 5, null, 'https://' + 'a'.repeat(3000)])
      expect(safeUrl(bad), String(bad)).toBeNull()
  })
})
