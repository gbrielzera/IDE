import { promises as nodeFs } from 'node:fs'

/** O pedaço de `fs.promises` que a gravação usa (permite simular falhas nos testes). */
export interface WriteFs {
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>
  rename(from: string, to: string): Promise<void>
  rm(path: string, options: { force: true }): Promise<void>
}

/** Erros que, no Windows, costumam ser passageiros: outro programa (antivírus, indexador, editor) está com o arquivo aberto. */
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES'])

const RENAME_ATTEMPTS = 6
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Grava um arquivo sem nunca deixá-lo pela metade: escreve num temporário e o renomeia por cima do destino.
 *
 * O `rename` por cima de um arquivo aberto por outro programa falha no Windows (EPERM/EBUSY), mas costuma
 * liberar em instantes: tenta de novo com espera crescente. Se persistir, grava direto no destino (perde a
 * troca atômica, mas salva) e, se nem isso for possível, relança o erro original. O temporário nunca fica
 * esquecido na pasta do projeto.
 */
export async function writeFileSafely(
  target: string,
  content: string,
  fs: WriteFs = nodeFs,
  sleep: (ms: number) => Promise<void> = wait
): Promise<void> {
  const tmp = `${target}.${process.pid}.tmp`
  try {
    await fs.writeFile(tmp, content, 'utf8')
    let lastError: unknown
    for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt++) {
      try {
        await fs.rename(tmp, target)
        return
      } catch (err) {
        lastError = err
        const code = (err as NodeJS.ErrnoException).code ?? ''
        if (!TRANSIENT.has(code)) throw err
        if (attempt < RENAME_ATTEMPTS - 1) await sleep(40 * 2 ** attempt) // 40, 80, 160, 320, 640 ms
      }
    }
    try {
      await fs.writeFile(target, content, 'utf8')
    } catch {
      throw lastError
    }
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
  }
}
