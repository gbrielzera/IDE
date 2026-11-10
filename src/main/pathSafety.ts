// Limite da pasta do projeto: nenhum caminho vindo do renderer, do manifesto ou de um script pode sair dela.
import { promises as fs } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

/** Resolve um caminho relativo garantindo, no TEXTO, que ele fique dentro da pasta do projeto (sem `..` nem caminho absoluto). */
export function insideProject(dir: string, rel: string): string {
  if (typeof rel !== 'string' || rel === '' || rel.includes('\0')) throw new Error(`Caminho inválido: ${String(rel)}`)
  if (isAbsolute(rel)) throw new Error(`Caminho absoluto não permitido: ${rel}`)
  const full = resolve(dir, rel)
  const back = relative(dir, full)
  if (back === '' || back === '..' || back.startsWith('..' + sep) || isAbsolute(back)) throw new Error(`Caminho fora do projeto: ${rel}`)
  return full
}

function contains(root: string, target: string): boolean {
  const back = relative(root, target)
  return back === '' || (back !== '..' && !back.startsWith('..' + sep) && !isAbsolute(back))
}

/** Caminho real do trecho mais profundo que já existe (o resto ainda vai ser criado). */
async function deepestRealPath(path: string): Promise<string> {
  let current = path
  for (;;) {
    try {
      return await fs.realpath(current)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      const parent = dirname(current)
      if (parent === current) throw err
      current = parent
    }
  }
}

/**
 * Como `insideProject`, mas também segue links simbólicos e junções: se o caminho (ou alguma pasta do
 * caminho) for um link que aponta para fora do projeto, recusa. Vale para leitura, gravação e remoção.
 */
export async function insideProjectReal(dir: string, rel: string): Promise<string> {
  const full = insideProject(dir, rel)
  const [realDir, realTarget] = await Promise.all([fs.realpath(dir), deepestRealPath(full)])
  if (!contains(realDir, realTarget)) throw new Error(`O caminho aponta para fora do projeto (link simbólico?): ${rel}`)
  return full
}
