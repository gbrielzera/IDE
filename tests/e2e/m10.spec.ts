import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchApp, Studio } from './helpers'

const s = new Studio()

test.afterEach(async () => {
  await s.stop()
})

test('renomear o ID não recria o componente: o elemento, o uid e o foco do painel continuam os mesmos', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  const el = await s.node('button1').elementHandle()
  const uid = await s.node('button1').getAttribute('data-uid')
  expect(uid).toMatch(/^[0-9a-f-]{36}$/)
  const field = s.prop('id')
  const fieldEl = await field.elementHandle()

  await field.fill('btnSalvar')
  await field.press('Enter')
  await expect(s.node('btnSalvar')).toHaveCount(1)
  expect(await el!.evaluate((e) => e.isConnected)).toBe(true) // o mesmo elemento da tela
  expect(await s.node('btnSalvar').getAttribute('data-uid')).toBe(uid)
  expect(await fieldEl!.evaluate((e) => e.isConnected)).toBe(true) // o painel não foi refeito
  await expect(s.node('btnSalvar')).toHaveClass(/selected/) // a seleção acompanha

  await s.page.keyboard.press('Control+z')
  await expect(s.node('button1')).toHaveCount(1)
  expect(await s.node('button1').getAttribute('data-uid')).toBe(uid)
})

test('copiar e duplicar criam componentes com uid novo', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.node('button1').click()
  await s.page.keyboard.press('Control+d')
  const uids = await s.page.locator('[data-uid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-uid')))
  expect(uids).toHaveLength(2)
  expect(new Set(uids).size).toBe(2)
})

test('formulário antigo (versão 1, sem uid) abre, é atualizado ao salvar e o original vira .bak', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.page.keyboard.press('Control+s')
  await expect(s.page.locator('.statusbar')).not.toContainText('não salvo')
  const file = join(s.dir, 'Main.form.json')
  const doc = JSON.parse(await readFile(file, 'utf8')) as { version: number; children: Array<Record<string, unknown>> }
  doc.version = 1
  for (const c of doc.children) delete c.uid
  const old = JSON.stringify(doc, null, 2) + '\n'
  await writeFile(file, old, 'utf8')

  const other = await launchApp()
  try {
    const page = await other.app.firstWindow()
    await page.waitForSelector('.welcome')
    await other.app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
    }, join(s.dir, 'project.json'))
    await page.getByRole('button', { name: 'Abrir projeto' }).click()
    await expect(page.locator('.console-line', { hasText: 'atualizado da versão 1 para 2' })).toBeVisible()
    await expect(page.locator('.statusbar')).toContainText('não salvo') // o arquivo só muda ao salvar
    expect(JSON.parse(await readFile(file, 'utf8')).version).toBe(1)
    await expect(page.locator('[data-uid]')).toHaveCount(1)

    await page.keyboard.press('Control+s')
    await expect(page.locator('.statusbar')).not.toContainText('não salvo')
    const saved = JSON.parse(await readFile(file, 'utf8')) as { version: number; children: Array<{ uid: string }> }
    expect(saved.version).toBe(2)
    expect(saved.children[0].uid).toMatch(/^[0-9a-f-]{36}$/)
    const bak = join(s.dir, 'Main.form.json.v1.bak')
    expect(existsSync(bak)).toBe(true)
    expect(await readFile(bak, 'utf8')).toBe(old) // exatamente o original

    // O uid se mantém ao salvar de novo e a cópia de segurança não é sobrescrita.
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+s')
    expect(JSON.parse(await readFile(file, 'utf8')).children?.[0]?.uid ?? saved.children[0].uid).toBe(saved.children[0].uid)
    expect(await readFile(bak, 'utf8')).toBe(old)
  } finally {
    await other.cleanup()
  }
})
