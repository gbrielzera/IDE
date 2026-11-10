import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { insideProject, insideProjectReal } from '../../src/main/pathSafety'

let root = ''
let project = ''
let outside = ''
let linkOk = true

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'vform-path-'))
  project = join(root, 'proj')
  outside = join(root, 'fora')
  await mkdir(project)
  await mkdir(outside)
  await mkdir(join(project, 'sub'))
  await writeFile(join(outside, 'segredo.py'), 'x')
  try {
    await symlink(outside, join(project, 'atalho'), 'junction') // junção: não exige administrador no Windows
  } catch {
    linkOk = false
  }
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('insideProject (texto)', () => {
  it('aceita caminhos dentro do projeto', () => {
    expect(insideProject(project, 'Main.py')).toBe(join(project, 'Main.py'))
    expect(insideProject(project, 'sub/a.json')).toBe(join(project, 'sub', 'a.json'))
  })
  it('recusa .., absolutos, vazio e NUL', () => {
    for (const bad of ['../x.py', 'sub/../../x.py', '..', '', 'a\0b', join(root, 'x.py')]) expect(() => insideProject(project, bad), bad).toThrow()
  })
})

describe('insideProjectReal (links)', () => {
  it('aceita arquivos novos e existentes dentro do projeto', async () => {
    await expect(insideProjectReal(project, 'novo.py')).resolves.toBe(join(project, 'novo.py'))
    await expect(insideProjectReal(project, 'sub/novo/ainda.py')).resolves.toContain('ainda.py')
  })
  it('recusa passar por um link que aponta para fora do projeto', async () => {
    if (!linkOk) return
    await expect(insideProjectReal(project, 'atalho/segredo.py')).rejects.toThrow(/fora do projeto/)
    await expect(insideProjectReal(project, 'atalho/novo.py')).rejects.toThrow(/fora do projeto/)
  })
})
