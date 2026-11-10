// Monta o manual (bytes do VForm.chm). Quem grava o arquivo é write.ts (`npm run manual`).
import { join } from 'node:path'
import { ansi, buildChm, buildIndex, buildToc, type ChmFile } from './chm'
import { buildPages, CSS, MANUAL_TITLE } from './pages'

export function manualBytes(): Buffer {
  const pages = buildPages()
  const sections = ['Guias', 'Componentes', 'Referência', 'Termos']
  const toc = [
    { title: 'Início', file: 'index.html' },
    ...sections.map((s) => ({
      title: s,
      children: pages.filter((p) => p.section === s).map((p) => ({ title: p.title, file: p.file }))
    }))
  ]
  const keywords = pages.flatMap((p) => p.keywords.map((keyword) => ({ keyword, title: p.title, file: p.file })))
  const text = (path: string, content: string): ChmFile => ({ path, data: Buffer.from(content, 'utf8') })
  const files: ChmFile[] = [
    ...pages.map((p) => text(`/${p.file}`, p.html)),
    text('/manual.css', CSS),
    { path: '/VForm.hhc', data: ansi(buildToc(toc)) },
    { path: '/VForm.hhk', data: ansi(buildIndex(keywords)) }
  ]
  return buildChm(files, { title: MANUAL_TITLE, home: 'index.html', toc: 'VForm.hhc', index: 'VForm.hhk', name: 'VForm' })
}

/** Caminho do manual publicado, a partir da raiz do projeto. */
export const MANUAL_PATH = join('docs', 'VForm.chm')
