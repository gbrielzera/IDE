import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeFileSafely, type WriteFs } from '../../src/main/safeWrite'

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: simulado`), { code })
}

/** Sistema de arquivos falso: registra as chamadas e falha onde o teste mandar. */
function fakeFs(opts: { renameFails?: number | 'always'; renameError?: string; writeTargetFails?: boolean; writeTmpFails?: boolean } = {}) {
  const calls: string[] = []
  let renames = 0
  const fs: WriteFs = {
    async writeFile(path, data) {
      calls.push(`write ${path.endsWith('.tmp') ? 'tmp' : 'destino'}`)
      if (path.endsWith('.tmp') && opts.writeTmpFails) throw errno('ENOSPC')
      if (!path.endsWith('.tmp') && opts.writeTargetFails) throw errno('EPERM')
      void data
    },
    async rename() {
      calls.push('rename')
      renames++
      if (opts.renameFails === 'always' || (typeof opts.renameFails === 'number' && renames <= opts.renameFails))
        throw errno(opts.renameError ?? 'EPERM')
    },
    async rm() {
      calls.push('rm tmp')
    }
  }
  return { fs, calls }
}

const sleeps: number[] = []
const sleep = async (ms: number): Promise<void> => void sleeps.push(ms)

describe('writeFileSafely', () => {
  it('grava no temporário, renomeia e não deixa o temporário para trás', async () => {
    const { fs, calls } = fakeFs()
    await writeFileSafely('C:\\p\\Main.py', 'x', fs, sleep)
    expect(calls).toEqual(['write tmp', 'rename', 'rm tmp'])
  })

  it('arquivo aberto por outro programa (EPERM passageiro): tenta de novo, com espera crescente, e conclui', async () => {
    sleeps.length = 0
    const { fs, calls } = fakeFs({ renameFails: 2 })
    await writeFileSafely('C:\\p\\Main.py', 'x', fs, sleep)
    expect(calls).toEqual(['write tmp', 'rename', 'rename', 'rename', 'rm tmp'])
    expect(sleeps).toEqual([40, 80])
  })

  it('EBUSY e EACCES também são tratados como passageiros', async () => {
    for (const code of ['EBUSY', 'EACCES']) {
      const { fs, calls } = fakeFs({ renameFails: 1, renameError: code })
      await writeFileSafely('C:\\p\\Main.py', 'x', fs, sleep)
      expect(calls.filter((c) => c === 'rename'), code).toHaveLength(2)
    }
  })

  it('se o rename nunca libera, grava direto no destino (e ainda limpa o temporário)', async () => {
    sleeps.length = 0
    const { fs, calls } = fakeFs({ renameFails: 'always' })
    await writeFileSafely('C:\\p\\Main.py', 'x', fs, sleep)
    expect(calls.filter((c) => c === 'rename')).toHaveLength(6)
    expect(calls.slice(-2)).toEqual(['write destino', 'rm tmp'])
    expect(sleeps).toEqual([40, 80, 160, 320, 640]) // não espera depois da última tentativa
  })

  it('se nem a gravação direta é possível, relança o erro do rename', async () => {
    const { fs, calls } = fakeFs({ renameFails: 'always', writeTargetFails: true })
    await expect(writeFileSafely('C:\\p\\Main.py', 'x', fs, sleep)).rejects.toMatchObject({ code: 'EPERM' })
    expect(calls.at(-1)).toBe('rm tmp')
  })

  it('erro que não é passageiro (pasta inexistente) falha na hora, sem tentar de novo', async () => {
    const { fs, calls } = fakeFs({ renameFails: 'always', renameError: 'ENOENT' })
    await expect(writeFileSafely('C:\\p\\Main.py', 'x', fs, sleep)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(calls).toEqual(['write tmp', 'rename', 'rm tmp'])
  })

  it('falha ao escrever o temporário (disco cheio): relança e limpa', async () => {
    const { fs, calls } = fakeFs({ writeTmpFails: true })
    await expect(writeFileSafely('C:\\p\\Main.py', 'x', fs, sleep)).rejects.toMatchObject({ code: 'ENOSPC' })
    expect(calls).toEqual(['write tmp', 'rm tmp'])
  })

  it('no disco de verdade: cria, sobrescreve e não deixa .tmp na pasta', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vform-safe-'))
    try {
      const file = join(dir, 'Main.py')
      await writeFileSafely(file, 'primeiro\n')
      await writeFileSafely(file, 'segundo: ação\n')
      expect(await readFile(file, 'utf8')).toBe('segundo: ação\n')
      await writeFile(join(dir, 'outro.txt'), 'não mexer', 'utf8')
      expect((await readdir(dir)).sort()).toEqual(['Main.py', 'outro.txt'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
