import { test, expect } from '@playwright/test'
import { Studio } from './helpers'

const s = new Studio()

test.afterEach(async () => {
  await s.stop()
})

test('prévia ao passar o cursor: aparece depois de uns instantes e some ao sair ou arrastar', async () => {
  await s.start()
  const item = s.palette('Button')
  await item.hover()
  await expect(s.page.getByTestId('hover-card')).toHaveCount(0) // ainda não: é preciso esperar
  const card = s.page.getByTestId('hover-card')
  await expect(card).toBeVisible({ timeout: 3000 })
  await expect(card).toContainText('Button')
  await expect(card).toContainText('botão')
  await expect(card.locator('.cmp-button')).toBeVisible() // desenho real do componente
  await s.page.mouse.move(600, 400)
  await expect(card).toHaveCount(0)
})

test('dicionário: F1 abre, navega entre componentes e termos, Esc fecha', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.page.keyboard.press('F1')
  const dict = s.page.getByTestId('dictionary')
  await expect(dict).toBeVisible()
  await expect(s.page.getByTestId('dictionary-page')).toContainText('Um botão que o usuário clica') // abre no tipo selecionado
  await expect(s.page.getByTestId('dictionary-page')).toContainText('on_click')

  await dict.getByRole('button', { name: 'ComboBox' }).click()
  await expect(s.page.getByTestId('dictionary-page')).toContainText('add_item')
  await dict.getByRole('button', { name: 'Evento' }).click()
  await expect(s.page.getByTestId('dictionary-page')).toContainText('Algo que acontece na tela')

  await s.page.keyboard.press('Escape')
  await expect(dict).toHaveCount(0)
  await s.page.getByRole('button', { name: 'Ajuda' }).click() // também pelo menu
  await s.page.getByRole('menuitem', { name: /Dicionário/ }).click()
  await expect(dict).toBeVisible()
})

test('aba Logs: guarda data/hora, nível e a execução; filtra e sobrevive ao "limpar" do console', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.setField('id', 'btnOk')
  await s.node('btnOk').dblclick() // cria o handler
  await s.waitEditorFocus()
  await s.page.keyboard.press('Shift+Home')
  await s.pasteInEditor('print("oi"); raise ValueError("deu ruim")')
  await s.page.getByTestId('tab-design-Main').click()
  const rp = await s.runForm()
  await rp.locator('[data-run-id="btnOk"] button').click()
  await expect(s.page.locator('.console-line.error').first()).toBeVisible()

  await s.page.locator('.pane-title button.link').click() // limpar o console
  await expect(s.page.locator('.console-line')).toHaveCount(0)

  await s.page.getByTestId('tab-logs').click()
  const list = s.page.getByTestId('logs-list')
  await expect(list).toContainText('Execução 1 iniciada')
  const erro = list.locator('.log-line.error').first()
  await expect(erro).toContainText('ValueError')
  await expect(erro).toContainText('ERRO')
  await expect(erro).toContainText('exec. 1')
  await expect(erro.locator('.console-time')).toHaveText(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/)

  await s.page.getByRole('button', { name: 'Erros' }).click()
  await expect(list.locator('.log-line:not(.error)')).toHaveCount(0)
  await s.page.getByRole('button', { name: 'Tudo' }).click()
  await expect(list.locator('.log-line.info').first()).toBeVisible()
})
