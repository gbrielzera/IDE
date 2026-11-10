import { test, expect, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Studio } from './helpers'

const s = new Studio()

test.afterEach(async () => {
  await s.stop()
})

const run = (page: Page, id: string) => page.locator(`[data-run-id="${id}"]`)

test.describe('editar o texto do componente (F2 e botão direito)', () => {
  test('F2 abre a caixa, Enter confirma, Esc cancela e Ctrl+Z desfaz', async () => {
    await s.start()
    await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
    await s.setField('id', 'btnOk')
    await s.node('btnOk').click()

    await s.page.keyboard.press('F2')
    const edit = s.page.getByTestId('text-edit')
    await expect(edit).toBeVisible()
    await expect(edit).toBeFocused()
    await edit.fill('Salvar')
    await edit.press('Enter')
    await expect(edit).toHaveCount(0)
    await expect(s.node('btnOk').locator('.cmp-button')).toHaveText('Salvar')

    await s.page.keyboard.press('F2')
    await s.page.getByTestId('text-edit').fill('Descartado')
    await s.page.getByTestId('text-edit').press('Escape')
    await expect(s.node('btnOk').locator('.cmp-button')).toHaveText('Salvar') // Esc cancela
    await expect(s.node('btnOk')).toHaveClass(/selected/) // e não limpa a seleção

    await s.page.keyboard.press('Control+z')
    await expect(s.node('btnOk').locator('.cmp-button')).toHaveText('Button')
  })

  test('menu do botão direito: editar texto, abrir código; sem texto o item fica desabilitado', async () => {
    await s.start()
    await s.dropFrom('Label', s.surface, { x: 102, y: 62 })
    await s.setField('id', 'lblA')
    await s.dropFrom('Panel', s.surface, { x: 302, y: 142 })
    await s.setField('id', 'pnlA')

    await s.node('lblA').click({ button: 'right' })
    const menu = s.page.getByTestId('context-menu')
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitem', { name: /Editar texto/ }).click()
    await s.page.getByTestId('text-edit').fill('Olá mundo')
    await s.page.keyboard.press('Enter')
    await expect(s.node('lblA')).toContainText('Olá mundo')

    await s.node('pnlA').click({ button: 'right' })
    await expect(s.page.getByRole('menuitem', { name: /Editar texto/ })).toBeDisabled()
    await s.page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)

    await s.node('lblA').click({ button: 'right' })
    await s.page.getByRole('menuitem', { name: /Abrir código/ }).click()
    await expect(s.page.locator('.monaco-editor .view-line').first()).toBeVisible()
  })

  test('botão direito no fundo do formulário oferece Colar', async () => {
    await s.start()
    await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
    await s.node('button1').click()
    await s.page.keyboard.press('Control+c')
    await s.surface.click({ button: 'right', position: { x: 400, y: 300 } })
    await s.page.getByRole('menuitem', { name: /Colar/ }).click()
    await expect(s.page.locator('[data-node-id="button2"]')).toHaveCount(1)
  })
})

test.describe('várias telas', () => {
  const addForm = async (name: string): Promise<void> => {
    await s.page.getByTestId('add-form').click()
    await s.page.getByTestId('new-form-name').fill(name)
    await s.page.getByTestId('new-form-ok').click()
  }

  test('criar valida o nome, abre a tela nova, e salva os arquivos e o project.json', async () => {
    await s.start()
    await s.page.getByTestId('add-form').click()
    const name = s.page.getByTestId('new-form-name')
    await expect(name).toHaveValue('Tela2')
    await name.fill('2ruim')
    await s.page.getByTestId('new-form-ok').click()
    await expect(s.page.getByTestId('form-dialog-error')).toBeVisible()
    await name.fill('main')
    await s.page.getByTestId('new-form-ok').click()
    await expect(s.page.getByTestId('form-dialog-error')).toContainText('Já existe')
    await name.fill('Cadastro')
    await s.page.getByTestId('new-form-ok').click()
    await expect(s.page.getByTestId('form-dialog')).toHaveCount(0)

    await expect(s.page.getByTestId('tab-design-Cadastro')).toHaveClass(/active/)
    await s.dropFrom('Button', s.surface, { x: 102, y: 62 }) // trabalha na tela nova
    await s.page.getByTestId('tab-design-Main').click() // trocar de tela
    await expect(s.page.locator('[data-node-id="button1"]')).toHaveCount(0)
    await s.page.getByTestId('tab-design-Cadastro').click()
    await expect(s.page.locator('[data-node-id="button1"]')).toHaveCount(1)

    await s.page.keyboard.press('Control+s')
    await expect(s.page.locator('.statusbar')).not.toContainText('não salvo')
    const manifest = JSON.parse(await readFile(join(s.dir, 'project.json'), 'utf8')) as { forms: Array<{ name: string }> }
    expect(manifest.forms.map((f) => f.name)).toEqual(['Main', 'Cadastro'])
    expect(await readFile(join(s.dir, 'Cadastro.form.json'), 'utf8')).toContain('button1')
    expect(existsSync(join(s.dir, 'Cadastro.py'))).toBe(true)
  })

  test('remover pede confirmação, guarda os arquivos como .removido e não deixa remover a última', async () => {
    await s.start()
    await addForm('Extra')
    await s.page.keyboard.press('Control+s')
    await expect(s.page.locator('.statusbar')).not.toContainText('não salvo')
    expect(existsSync(join(s.dir, 'Extra.form.json'))).toBe(true)

    await s.page.getByRole('button', { name: 'Arquivo' }).click()
    await s.page.getByRole('menuitem', { name: /Remover tela atual/ }).click()
    await expect(s.page.getByTestId('form-dialog')).toContainText('Remover a tela "Extra"')
    await s.page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(s.page.getByTestId('tab-design-Extra')).toBeVisible() // cancelar não remove

    await s.page.getByRole('button', { name: 'Arquivo' }).click()
    await s.page.getByRole('menuitem', { name: /Remover tela atual/ }).click()
    await s.page.getByTestId('remove-form-ok').click()
    await expect(s.page.getByTestId('tab-design-Extra')).toHaveCount(0)
    await expect(s.page.getByTestId('tab-design-Main')).toHaveClass(/active/)

    await s.page.keyboard.press('Control+s')
    await expect(s.page.locator('.statusbar')).not.toContainText('não salvo')
    expect(existsSync(join(s.dir, 'Extra.form.json'))).toBe(false)
    expect(existsSync(join(s.dir, 'Extra.form.json.removido'))).toBe(true)
    expect(existsSync(join(s.dir, 'Extra.py.removido'))).toBe(true)
    const manifest = JSON.parse(await readFile(join(s.dir, 'project.json'), 'utf8')) as { forms: Array<{ name: string }> }
    expect(manifest.forms.map((f) => f.name)).toEqual(['Main'])

    await s.page.getByRole('button', { name: 'Arquivo' }).click() // só sobrou uma tela: não dá para remover
    await expect(s.page.getByRole('menuitem', { name: /Remover tela atual/ })).toBeDisabled()
  })

  test('app.open_form("Tela") troca de tela durante a execução, e nome inexistente vira erro no console', async () => {
    await s.start()
    // Tela2 com um rótulo.
    await addForm('Tela2')
    await s.dropFrom('Label', s.surface, { x: 102, y: 62 })
    await s.setField('id', 'lblB')
    await s.setField('text', 'Estou na tela 2')
    // Main com dois botões.
    await s.page.getByTestId('tab-design-Main').click()
    await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
    await s.setField('id', 'btnIr')
    await s.setField('text', 'Ir')
    await s.dropFrom('Button', s.surface, { x: 302, y: 62 })
    await s.setField('id', 'btnErro')
    await s.node('btnIr').dblclick()
    await s.waitEditorFocus()
    await s.page.keyboard.press('Shift+Home')
    await s.pasteInEditor('app.open_form("Tela2")')
    await s.page.getByTestId('tab-design-Main').click()
    await s.node('btnErro').dblclick()
    await s.waitEditorFocus()
    await s.page.keyboard.press('Shift+Home')
    await s.pasteInEditor('app.open_form("NaoExiste")')
    await s.page.getByTestId('tab-design-Main').click()

    const rp = await s.runForm()
    await run(rp, 'btnErro').locator('button').click()
    await expect(s.page.locator('.console-line.error', { hasText: 'a tela "NaoExiste" não existe' })).toBeVisible()
    await expect(run(rp, 'btnIr')).toBeVisible() // continua na tela atual

    await run(rp, 'btnIr').locator('button').click()
    await expect(run(rp, 'lblB')).toContainText('Estou na tela 2', { timeout: 10_000 })
    await expect(run(rp, 'btnIr')).toHaveCount(0)
  })
})

test('Ajuda → Manual do usuário (.chm) localiza o manual (sem abrir janela nos testes)', async () => {
  await s.start()
  await s.page.getByRole('button', { name: 'Ajuda' }).click()
  await s.page.getByRole('menuitem', { name: /Manual do usuário/ }).click()
  await expect(s.page.locator('.console-line', { hasText: /Manual aberto .*VForm\.chm/ })).toBeVisible()
})
