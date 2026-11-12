import { test, expect, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Studio } from './helpers'

const s = new Studio()

test.afterEach(async () => {
  await s.stop()
})

const run = (page: Page, id: string) => page.locator(`[data-run-id="${id}"]`)

async function add(type: string, id: string): Promise<void> {
  await s.palette(type).dblclick()
  await s.setField('id', id)
}

test('propriedades completas dos campos: prefixo/sufixo, sem negativos, limite da senha, botões da data, textos do interruptor', async () => {
  await s.start()
  await add('NumericField', 'num')
  await s.setField('prefix', 'R$')
  await s.setField('suffix', 'un')
  await s.setField('minValue', '-50')
  await s.prop('allowNegative').uncheck()
  await expect(s.node('num')).toContainText('R$') // aparece já no editor
  await add('PasswordField', 'pwd')
  await s.setField('maxLength', '4')
  await add('DatePicker', 'dt')
  await s.prop('allowClear').check()
  await s.prop('showTodayButton').check()
  await s.setField('x', '320') // longe dos outros (os componentes novos nascem em cascata, um sobre o outro)
  await s.setField('y', '40')
  await s.setField('width', '240')
  await add('ToggleSwitch', 'sw')
  await s.setField('onText', 'Ativado')
  await s.setField('offText', 'Desativado')
  await s.setField('description', 'explicação')
  await s.setField('x', '320')
  await s.setField('y', '120')
  await s.setField('height', '40')
  await expect(s.node('sw')).toContainText('Desativado')

  const rp = await s.runForm()
  await expect(run(rp, 'num')).toContainText('R$')
  await expect(run(rp, 'num')).toContainText('un')
  const num = run(rp, 'num').locator('input')
  await num.fill('-5')
  await num.press('Enter')
  await expect(num).toHaveValue('0') // negativos desligados: o mínimo vira zero

  await run(rp, 'pwd').locator('input').pressSequentially('123456')
  await expect(run(rp, 'pwd').locator('input')).toHaveValue('1234')

  const date = run(rp, 'dt').locator('input')
  await run(rp, 'dt').getByRole('button', { name: 'Hoje' }).click()
  await expect(date).toHaveValue(new Date().toLocaleDateString('sv-SE'))
  await run(rp, 'dt').getByTitle('Limpar a data').click()
  await expect(date).toHaveValue('')

  await expect(run(rp, 'sw')).toContainText('Desativado')
  await expect(run(rp, 'sw')).toContainText('explicação')
  await run(rp, 'sw').locator('.r-switch').click()
  await expect(run(rp, 'sw')).toContainText('Ativado')
})

test('eventos novos: release do Slider, dismiss do Alert, collapse/expand do Card e complete da ProgressBar', async () => {
  await s.start()
  await add('Slider', 'sld')
  await add('Alert', 'alt')
  await s.prop('dismissible').check()
  await add('ProgressBar', 'pb')
  await s.prop('showLabel').check()
  await add('Label', 'out')
  await add('Button', 'btn')
  await add('Card', 'crd')
  await s.prop('collapsible').check()
  await s.setField('x', '320')
  await s.setField('y', '200')
  const surface = (await s.surface.boundingBox())!
  const card = (await s.node('crd').boundingBox())!
  await s.dropFrom('Button', s.surface, { x: card.x - surface.x + 40, y: card.y - surface.y + 90 })
  await s.setField('id', 'dentro')

  await writeFile(
    join(s.dir, 'Main.py'),
    `
log = []

def mostra(texto):
    log.append(texto)
    form.out.text = " | ".join(log)

@form.sld.on_release
def soltou(ev):
    mostra("soltou " + str(ev.value))

@form.alt.on_dismiss
def fechou():
    mostra("fechou")

@form.crd.on_collapse
def recolheu():
    mostra("recolheu")

@form.crd.on_expand
def expandiu():
    mostra("expandiu")

@form.pb.on_complete
def completou(ev):
    mostra("completo")

@form.btn.on_click
def clicou():
    form.pb.increment(100)
    form.crd.expand()
`,
    'utf8'
  )
  const rp = await s.runForm()

  const slider = run(rp, 'sld').locator('input')
  await slider.focus()
  await slider.press('ArrowRight')
  await expect(run(rp, 'out')).toContainText('soltou 51')

  await run(rp, 'alt').getByRole('button', { name: 'Fechar o aviso' }).click()
  await expect(run(rp, 'alt')).toBeHidden()
  await expect(run(rp, 'out')).toContainText('fechou')

  // Recolher: sobra só o cabeçalho e o filho some.
  await expect(run(rp, 'dentro')).toBeVisible()
  await run(rp, 'crd').getByRole('button', { name: 'Recolher' }).click()
  await expect(run(rp, 'dentro')).toHaveCount(0)
  expect((await run(rp, 'crd').boundingBox())!.height).toBe(44)
  await expect(run(rp, 'out')).toContainText('recolheu')

  // O script expande de volta e completa a barra.
  await run(rp, 'btn').locator('button').click()
  await expect(run(rp, 'dentro')).toBeVisible()
  await expect(run(rp, 'pb')).toContainText('100%')
  await expect(run(rp, 'out')).toContainText('completo')
  await expect(run(rp, 'out')).not.toContainText('expandiu') // mudança feita pelo script não dispara o evento do usuário
  await run(rp, 'crd').getByRole('button', { name: 'Recolher' }).click()
  await run(rp, 'crd').getByRole('button', { name: 'Expandir' }).click()
  await expect(run(rp, 'out')).toContainText('expandiu')
  await expect(s.page.locator('.console-line.error')).toHaveCount(0)
})

test('orientação vertical do Slider e da ProgressBar, link sem sublinhado e Card sem borda', async () => {
  await s.start()
  await add('Slider', 'sld')
  await s.prop('orientation').selectOption('vertical')
  await add('ProgressBar', 'pb')
  await s.prop('orientation').selectOption('vertical')
  await add('Link', 'lnk')
  await s.prop('underline').uncheck()
  await add('Card', 'crd')
  await s.prop('border').uncheck()
  await s.prop('shadow').uncheck()
  await expect(s.node('sld').locator('.cmp-slider')).toHaveClass(/vertical/)
  await expect(s.node('crd').locator('.cmp-card')).toHaveClass(/no-border/)

  const rp = await s.runForm()
  await expect(run(rp, 'sld').locator('.r-slider')).toHaveClass(/vertical/)
  await expect(run(rp, 'pb').locator('[role=progressbar]')).toHaveAttribute('aria-orientation', 'vertical')
  await expect(run(rp, 'lnk').locator('a')).toHaveCSS('text-decoration-line', 'none')
  await expect(run(rp, 'crd').locator('.r-card')).toHaveClass(/no-border.*no-shadow/)
})
