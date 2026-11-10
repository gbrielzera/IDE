// Conteúdo do manual (VForm.chm), montado a partir das MESMAS fontes do dicionário (F1): glossary.ts, o catálogo de
// componentes e a API Python. Assim, mudar uma dessas fontes e rodar `npm run manual` atualiza o manual inteiro.
import { allPropDefs, CATALOG, CATALOG_BY_TYPE } from '../../src/renderer/src/components/catalog'
import { ATALHOS, COMPONENT_HELP, GUIDES, NOVIDADES, TERMS } from '../../src/renderer/src/core/glossary'
import { APP_MEMBERS, EVENTS, FORM_EXTRAS, membersOf, toSnake } from '../../src/renderer/src/core/pyapi'

export interface Page {
  /** Nome do arquivo dentro do .chm. */
  file: string
  title: string
  html: string
  /** Seção do sumário em que aparece. */
  section: string
  /** Palavras do índice remissivo. */
  keywords: string[]
}

export const MANUAL_TITLE = 'VForm IDE - Manual'

export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const code = (text: string): string => `<pre>${esc(text)}</pre>`

export const CSS = `
body { font-family: "Segoe UI", Tahoma, sans-serif; font-size: 10pt; margin: 18px 26px; color: #25251f; background: #fbfbf8; }
h1 { font-size: 17pt; border-bottom: 2px solid #41618a; padding-bottom: 4px; }
h2 { font-size: 12.5pt; margin-top: 22px; color: #41618a; }
pre { background: #e9e8e1; border: 1px solid #9a9990; padding: 7px 10px; font-family: Consolas, "Lucida Console", monospace; font-size: 9.5pt; }
code { font-family: Consolas, "Lucida Console", monospace; background: #e9e8e1; padding: 0 3px; }
table { border-collapse: collapse; } td, th { border: 1px solid #b5b4aa; padding: 3px 9px; text-align: left; }
th { background: #e3e3d9; } .nav { margin-top: 28px; font-size: 9pt; color: #63625e; }
`

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html>\n<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><link rel="stylesheet" href="manual.css"></head><body>\n<h1>${esc(title)}</h1>\n${body}\n</body></html>\n`
}

function guideBody(id: string): string {
  const guide = GUIDES.find((g) => g.id === id)!
  const out: string[] = []
  let list = false
  for (const b of guide.blocos) {
    if (b.tipo !== 'li' && list) {
      out.push('</ul>')
      list = false
    }
    if (b.tipo === 'li') {
      if (!list) out.push('<ul>')
      list = true
      out.push(`<li>${esc(b.texto)}</li>`)
    } else if (b.tipo === 'code') out.push(code(b.texto))
    else out.push(`<p>${esc(b.texto)}</p>`)
  }
  if (list) out.push('</ul>')
  return out.join('\n')
}

function componentBody(type: string): string {
  const help = COMPONENT_HELP[type]
  const { own } = allPropDefs(type)
  const events = EVENTS[type] ?? []
  const methods = membersOf(type).filter((m) => m.kind === 'method' && m.name !== 'on')
  const out: string[] = []
  out.push(`<p>${esc(help.resumo)}</p>`, '<h2>Para que serve</h2>', `<p>${esc(help.paraQue)}</p>`)
  out.push('<h2>Exemplo no código</h2>', code(help.exemplo))
  if (own.length > 0) {
    out.push('<h2>Características que você pode mudar</h2>', '<table><tr><th>No painel</th><th>No código</th></tr>')
    for (const p of own) out.push(`<tr><td>${esc(p.label)}</td><td><code>form.meu_id.${esc(toSnake(p.key))}</code></td></tr>`)
    out.push('</table>')
  }
  if (events.length > 0) {
    out.push('<h2>Eventos</h2>', '<ul>')
    for (const e of events) out.push(`<li><code>@form.meu_id.on_${esc(e)}</code></li>`)
    out.push('</ul>')
  }
  if (methods.length > 0) {
    out.push('<h2>Ações</h2>', '<ul>')
    for (const m of methods) out.push(`<li><code>${esc(m.detail)}</code> — ${esc(m.doc ?? '')}</li>`)
    out.push('</ul>')
  }
  return out.join('\n')
}

function apiBody(): string {
  const rows = (items: Array<{ name: string; detail: string; doc?: string }>, prefix: string): string =>
    `<table><tr><th>Uso</th><th>O que faz</th></tr>${items
      .map((m) => `<tr><td><code>${esc(prefix + m.detail)}</code></td><td>${esc(m.doc ?? '')}</td></tr>`)
      .join('')}</table>`
  return [
    '<h2>app — a janela em execução</h2>',
    rows(APP_MEMBERS.map((m) => ({ ...m, detail: m.kind === 'method' ? m.detail : m.name })), 'app.'),
    '<h2>form — a tela</h2>',
    rows(FORM_EXTRAS, '@form.'),
    '<p>Os componentes são acessados por ID: <code>form.meuId.propriedade</code>. Cada tipo de componente tem sua página com as propriedades, eventos e ações.</p>'
  ].join('\n')
}

/** Todas as páginas do manual, na ordem do sumário. */
export function buildPages(): Page[] {
  const pages: Page[] = []
  pages.push({
    file: 'index.html',
    title: 'VForm IDE — Manual do usuário',
    section: '',
    keywords: ['manual', 'início'],
    html: wrap(
      'VForm IDE — Manual do usuário',
      '<p>Bem-vindo! Este manual explica como montar telas e programá-las em Python. Use o sumário à esquerda ou o índice.</p>\n<p>Dentro da IDE, <b>F1</b> abre o dicionário com o mesmo conteúdo.</p>'
    )
  })
  for (const g of GUIDES)
    pages.push({ file: `guia-${g.id}.html`, title: g.titulo, section: 'Guias', keywords: [g.titulo], html: wrap(g.titulo, guideBody(g.id)) })
  pages.push({
    file: 'atalhos.html',
    title: 'Atalhos do teclado',
    section: 'Guias',
    keywords: ['atalhos', 'teclado'],
    html: wrap(
      'Atalhos do teclado',
      `<table><tr><th>Tecla</th><th>O que faz</th></tr>${ATALHOS.map((a) => `<tr><td><b>${esc(a.teclas)}</b></td><td>${esc(a.acao)}</td></tr>`).join('')}</table>`
    )
  })
  for (const c of CATALOG) {
    if (!CATALOG_BY_TYPE[c.type] || !COMPONENT_HELP[c.type]) throw new Error(`Componente sem texto no glossário: ${c.type}`)
    pages.push({
      file: `componente-${slug(c.type)}.html`,
      title: c.label,
      section: 'Componentes',
      keywords: [c.label, c.type],
      html: wrap(c.label, componentBody(c.type))
    })
  }
  pages.push({ file: 'api-python.html', title: 'app e form (API Python)', section: 'Referência', keywords: ['app', 'form', 'API', 'Python', 'open_form'], html: wrap('app e form (API Python)', apiBody()) })
  TERMS.forEach((t, i) =>
    pages.push({
      file: `termo-${i + 1}-${slug(t.nome)}.html`,
      title: t.nome,
      section: 'Termos',
      keywords: [t.nome],
      html: wrap(t.nome, `<p>${esc(t.explicacao)}</p>${t.exemplo ? `<h2>Exemplo</h2>${code(t.exemplo)}` : ''}`)
    })
  )
  pages.push({
    file: 'novidades.html',
    title: 'Novidades',
    section: 'Referência',
    keywords: ['novidades', 'versões', 'histórico'],
    html: wrap('Novidades', NOVIDADES.map((n) => `<h2>${esc(n.titulo)}</h2><ul>${n.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('\n'))
  })
  return pages
}
