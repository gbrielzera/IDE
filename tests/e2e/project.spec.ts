import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const MAIN = resolve(__dirname, '../../out/main/index.js')

let app: ElectronApplication
let page: Page
let dir: string

/** Troca o diálogo nativo de pasta por uma resposta fixa. */
async function stubFolderDialog(folder: string): Promise<void> {
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
  }, folder)
}

test.beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vform-e2e-'))
  app = await electron.launch({ args: [MAIN] })
  page = await app.firstWindow()
  await page.waitForSelector('.welcome')
})

test.afterEach(async () => {
  await app.close()
  await rm(dir, { recursive: true, force: true })
})

test('novo projeto cria os arquivos e mostra o formulário Main', async ({}, info) => {
  await stubFolderDialog(dir)
  await page.getByRole('button', { name: 'Novo projeto' }).click()

  await expect(page.locator('.tab.active')).toHaveText('Main.form.json')
  await expect(page.locator('.form-titlebar')).toHaveText('Main')
  await expect(page.locator('.console-line').last()).toContainText('criado')
  await expect(page).toHaveTitle(/ — VForm IDE$/)

  const manifest = JSON.parse(await readFile(join(dir, 'project.json'), 'utf8'))
  expect(manifest.format).toBe('vform-project')
  expect(manifest.forms).toEqual([{ name: 'Main', layout: 'Main.form.json', script: 'Main.py' }])
  const form = JSON.parse(await readFile(join(dir, 'Main.form.json'), 'utf8'))
  expect(form).toMatchObject({ format: 'vform-form', name: 'Main', width: 640, height: 480, children: [] })
  expect(await readFile(join(dir, 'Main.py'), 'utf8')).toContain('@form.on_load')

  await page.screenshot({ path: info.outputPath('novo-projeto.png') })
})

test('não cria projeto por cima de outro', async () => {
  await stubFolderDialog(dir)
  await page.getByRole('button', { name: 'Novo projeto' }).click()
  await expect(page.locator('.tab.active')).toBeVisible()

  await page.getByRole('button', { name: 'Novo', exact: true }).click()
  await expect(page.locator('.console-line.error').last()).toContainText('já contém um projeto')
})

test('abrir e salvar (Ctrl+S) um projeto existente', async () => {
  await stubFolderDialog(dir)
  await page.getByRole('button', { name: 'Novo projeto' }).click()
  await expect(page.locator('.tab.active')).toBeVisible()
  const before = await readFile(join(dir, 'Main.py'), 'utf8')

  // Simula outra ferramenta mudando o título e reabre o projeto.
  const formPath = join(dir, 'Main.form.json')
  const form = JSON.parse(await readFile(formPath, 'utf8'))
  form.title = 'Cadastro'
  await writeFile(formPath, JSON.stringify(form), 'utf8')

  await page.getByRole('button', { name: 'Abrir', exact: true }).click()
  await expect(page.locator('.form-titlebar')).toHaveText('Cadastro')

  await page.keyboard.press('Control+s')
  await expect(page.locator('.console-line').last()).toHaveText(/Projeto salvo\./)
  expect(await readFile(join(dir, 'Main.py'), 'utf8')).toBe(before)
})

test('salvar recusa caminhos fora do projeto e tipos não permitidos', async () => {
  await stubFolderDialog(dir)
  await page.getByRole('button', { name: 'Novo projeto' }).click()
  await expect(page.locator('.tab.active')).toBeVisible()

  const results = await page.evaluate(async () => [
    await window.vform.saveProject({ '../fora.py': 'x' }),
    await window.vform.saveProject({ 'C:\\Windows\\fora.py': 'x' }),
    await window.vform.saveProject({ 'virus.exe': 'x' })
  ])
  expect(results[0]).toEqual({ ok: false, error: expect.stringContaining('fora do projeto') })
  expect(results[1]).toEqual({ ok: false, error: expect.stringContaining('absoluto') })
  expect(results[2]).toEqual({ ok: false, error: expect.stringContaining('não permitido') })
})
