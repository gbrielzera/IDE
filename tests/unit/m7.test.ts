import { describe, expect, it } from 'vitest'
import { CATALOG } from '../../src/renderer/src/components/catalog'
import { COMPONENT_HELP, TERMS } from '../../src/renderer/src/core/glossary'
import { useIde } from '../../src/renderer/src/store'

describe('dicionário', () => {
  it('explica todos os componentes do catálogo, com exemplo', () => {
    for (const c of CATALOG) {
      const h = COMPONENT_HELP[c.type]
      expect(h, c.type).toBeDefined()
      expect(h.resumo.length).toBeGreaterThan(10)
      expect(h.exemplo).toContain('form.')
    }
  })

  it('tem termos com explicação', () => {
    expect(TERMS.length).toBeGreaterThan(4)
    for (const t of TERMS) expect(t.explicacao.length).toBeGreaterThan(20)
  })

  it('abre e fecha pelo store', () => {
    useIde.getState().openDictionary({ kind: 'term', index: 1 })
    expect(useIde.getState().dictionary).toEqual({ kind: 'term', index: 1 })
    useIde.getState().closeDictionary()
    expect(useIde.getState().dictionary).toBeNull()
  })
})

describe('logs', () => {
  it('guardam data, nível e a execução; limpar o console não apaga os logs', () => {
    const s = useIde.getState()
    s.clearLogs()
    s.log('warn', 'cuidado')
    s.log('error', 'quebrou', { file: 'Main.py', line: 3 })
    const logs = useIde.getState().logs
    expect(logs.map((l) => l.level)).toEqual(['warn', 'error'])
    expect(Number.isNaN(Date.parse(logs[0].at))).toBe(false)
    expect(logs[1]).toMatchObject({ file: 'Main.py', line: 3, run: null })
    s.clearConsole()
    expect(useIde.getState().console).toHaveLength(0)
    expect(useIde.getState().logs).toHaveLength(2)
  })
})
