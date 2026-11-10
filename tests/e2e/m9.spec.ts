import { test, expect } from '@playwright/test'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchApp, Studio } from './helpers'

const s = new Studio()

test.afterEach(async () => {
  await s.stop()
})

test('projeto aberto de fora pede confiança antes da 1ª execução; criado na IDE não pede', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.page.keyboard.press('Control+s')
  await expect(s.page.locator('.statusbar')).not.toContainText('não salvo')
  // Quem criou o projeto aqui já confia nele.
  const own = await s.runForm()
  await own.close()

  // Outro "usuário" (perfil novo) abre a mesma pasta: é um projeto de fora.
  const other = await launchApp()
  try {
    const page = await other.app.firstWindow()
    await page.waitForSelector('.welcome')
    await other.app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
    }, join(s.dir, 'project.json'))
    await page.getByRole('button', { name: 'Abrir projeto' }).click()
    await expect(page.getByTestId('surface')).toBeVisible()

    await page.keyboard.press('F5')
    const dialog = page.getByTestId('form-dialog')
    await expect(dialog).toContainText('não é um ambiente isolado')
    await page.getByRole('button', { name: 'Cancelar' }).click()
    expect(other.app.windows()).toHaveLength(1) // nada foi executado

    const [run] = await Promise.all([other.app.waitForEvent('window'), page.keyboard.press('F5').then(() => page.getByTestId('trust-ok').click())])
    await run.waitForSelector('.run-root')
    await run.close()

    await page.keyboard.press('F5') // agora é confiável: executa direto
    await expect(page.getByTestId('form-dialog')).toHaveCount(0)
    const again = await other.app.waitForEvent('window')
    await again.waitForSelector('.run-root')
  } finally {
    await other.cleanup()
  }
})

test('script preso num laço no carregamento é interrompido depois do prazo', async () => {
  await s.start({ VFORM_LOAD_TIMEOUT_MS: '1500' })
  await writeFile(join(s.dir, 'Main.py'), 'while True:\n    pass\n', 'utf8')
  await s.page.keyboard.press('F5')
  await expect(s.page.locator('.console-line.error', { hasText: 'não terminou de carregar' })).toBeVisible({ timeout: 15_000 })
  await expect(s.page.getByRole('button', { name: /Parar/ })).toBeDisabled() // a execução foi encerrada
})

test('formulário com problema não executa e o console diz onde está o erro', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.page.keyboard.press('Control+s')
  await expect(s.page.locator('.statusbar')).not.toContainText('não salvo')
  const file = join(s.dir, 'Main.form.json')
  const doc = JSON.parse(await readFile(file, 'utf8')) as { children: Array<{ props: Record<string, unknown> }> }
  doc.children[0].props.fontSize = 999 // acima do máximo
  await writeFile(file, JSON.stringify(doc), 'utf8')

  // Reabre pela IDE (outro perfil) para ler o arquivo alterado.
  const other = await launchApp()
  try {
    const page = await other.app.firstWindow()
    await page.waitForSelector('.welcome')
    await other.app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
    }, join(s.dir, 'project.json'))
    await page.getByRole('button', { name: 'Abrir projeto' }).click()
    await expect(page.locator('.console-line.error', { hasText: 'propriedade fontSize' })).toBeVisible()
    await page.keyboard.press('F5')
    await page.getByTestId('trust-ok').click() // projeto de fora: confirma a confiança, e só então a validação barra
    await expect(page.locator('.console-line.error', { hasText: 'Não é possível executar' })).toBeVisible()
    expect(other.app.windows()).toHaveLength(1)
  } finally {
    await other.cleanup()
  }
})

test('manifesto com caminho para fora da pasta é recusado ao abrir, com a mensagem do problema', async () => {
  await s.start()
  const manifest = JSON.parse(await readFile(join(s.dir, 'project.json'), 'utf8')) as { forms: Array<{ layout: string }> }
  manifest.forms[0].layout = '../roubo.form.json'
  await writeFile(join(s.dir, 'project.json'), JSON.stringify(manifest), 'utf8')

  const other = await launchApp()
  try {
    const page = await other.app.firstWindow()
    await page.waitForSelector('.welcome')
    await other.app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
    }, join(s.dir, 'project.json'))
    await page.getByRole('button', { name: 'Abrir projeto' }).click()
    await expect(page.locator('.console-line.error', { hasText: '".."' })).toBeVisible()
    await expect(page.getByTestId('surface')).toHaveCount(0) // não abriu
  } finally {
    await other.cleanup()
  }
})

test('link para fora da pasta do projeto não é lido nem gravado', async () => {
  await s.start()
  const outside = join(s.dir, '..', `fora-${Date.now()}`)
  await mkdir(outside, { recursive: true })
  await writeFile(join(outside, 'Main.py'), 'print("segredo")\n', 'utf8')
  // Troca a pasta "sub" por uma junção que aponta para fora e faz o formulário usá-la.
  try {
    await symlink(outside, join(s.dir, 'sub'), 'junction')
  } catch {
    test.skip(true, 'sem permissão para criar link')
  }
  const manifest = JSON.parse(await readFile(join(s.dir, 'project.json'), 'utf8')) as { forms: Array<{ script: string }> }
  manifest.forms[0].script = 'sub/Main.py'
  await writeFile(join(s.dir, 'project.json'), JSON.stringify(manifest), 'utf8')

  const other = await launchApp()
  try {
    const page = await other.app.firstWindow()
    await page.waitForSelector('.welcome')
    await other.app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
    }, join(s.dir, 'project.json'))
    await page.getByRole('button', { name: 'Abrir projeto' }).click()
    await expect(page.locator('.console-line.error', { hasText: 'fora do projeto' })).toBeVisible()
  } finally {
    await other.cleanup()
  }
})
