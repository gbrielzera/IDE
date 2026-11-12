import { test, expect, type Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Studio } from './helpers'

const s = new Studio()

test.afterEach(async () => {
  await s.stop()
})

const run = (page: Page, id: string) => page.locator(`[data-run-id="${id}"]`)

/** Acrescenta um componente pela paleta (dois cliques) e dá a ele o ID pedido. */
async function add(type: string, id: string): Promise<void> {
  await s.palette(type).dblclick()
  await s.setField('id', id)
}

test('os 10 componentes novos entram pela paleta, são desenhados, salvos e reabertos', async () => {
  await s.start()
  const types = ['NumericField', 'PasswordField', 'DatePicker', 'Slider', 'ToggleSwitch', 'ProgressBar', 'Alert', 'Link', 'Card', 'GroupBox']
  for (const t of types) await add(t, `c${t}`)
  for (const t of types) await expect(s.node(`c${t}`)).toBeVisible()
  await expect(s.page.locator('.cmp-unknown')).toHaveCount(0) // todos têm desenho próprio
  await expect(s.node('cAlert')).toContainText('Mensagem de aviso')
  await expect(s.node('cCard').locator('.cmp-card-head')).toContainText('Título')

  await s.page.keyboard.press('Control+s')
  await expect(s.page.locator('.statusbar')).not.toContainText('não salvo')
  const saved = JSON.parse(await readFile(join(s.dir, 'Main.form.json'), 'utf8')) as { children: Array<{ type: string }> }
  expect(saved.children.map((c) => c.type)).toEqual(types)
  await expect(s.page.locator('.console-line.error')).toHaveCount(0)
})

test('Card e GroupBox são containers: o que é solto dentro vira filho, abaixo do cabeçalho', async () => {
  await s.start()
  for (const [type, id] of [['Card', 'crd'], ['GroupBox', 'grp']] as const) {
    await add(type, id)
    await s.node(id).click()
    await s.setField('x', '320')
    await s.setField('y', type === 'Card' ? '40' : '260')
  }
  const surface = (await s.surface.boundingBox())!
  for (const [id, child] of [['crd', 'button1'], ['grp', 'button2']] as const) {
    const box = (await s.node(id).boundingBox())!
    await s.dropFrom('Button', s.surface, { x: box.x - surface.x + 40, y: box.y - surface.y + 80 })
    await expect(s.childOf(id, child)).toHaveCount(1)
  }
  // O filho fica abaixo do cabeçalho do Card (44px reservados).
  const head = (await s.node('crd').locator('.cmp-card-head').boundingBox())!
  const kid = (await s.childOf('crd', 'button1').boundingBox())!
  expect(kid.y).toBeGreaterThanOrEqual(head.y + head.height - 1)
})

test('componentes novos funcionam na execução: valores, eventos, métodos e link validado', async () => {
  await s.start()
  await add('NumericField', 'num')
  await add('Slider', 'sld')
  await add('ToggleSwitch', 'sw')
  await add('ProgressBar', 'pb')
  await add('Alert', 'alt')
  await add('PasswordField', 'pwd')
  await add('DatePicker', 'dt')
  await add('Link', 'lnk')
  await add('Label', 'out')
  await add('Button', 'btn')
  await writeFile(
    join(s.dir, 'Main.py'),
    `
@form.on_load
def inicio():
    form.num.set_range(0, 10)
    form.num.value = 3
    form.pb.value = 0
    form.lnk.url = "https://www.python.org/"

@form.num.on_change
def mudou(ev):
    form.out.text = "num=" + str(ev.value)

@form.sw.on_change
def trocou(ev):
    form.alt.variant = "success" if ev.checked else "warning"
    form.alt.text = "ligado" if ev.checked else "desligado"

@form.sld.on_change
def deslizou(ev):
    form.pb.value = ev.value

@form.pwd.on_change
def senha(ev):
    form.out.text = "senha com " + str(len(form.pwd.value)) + " letras"

@form.dt.on_change
def data(ev):
    form.out.text = "data " + ev.value

@form.btn.on_click
def clicou():
    form.num.increment(100)
    form.pb.increment(25)
    form.pwd.show_password()
    form.dt.set_today()
    form.lnk.text = "abrir"
`,
    'utf8'
  )
  const rp = await s.runForm()

  // NumericField: digitar fora da faixa é ajustado ao máximo.
  const num = run(rp, 'num').locator('input')
  await expect(num).toHaveValue('3')
  await num.fill('99')
  await num.press('Enter')
  await expect(num).toHaveValue('10')
  await expect(run(rp, 'out')).toContainText('num=10')

  // ToggleSwitch muda o Alert pelo script.
  await run(rp, 'sw').locator('.r-switch').click()
  await expect(run(rp, 'alt').locator('.r-alert')).toHaveClass(/v-success/)
  await expect(run(rp, 'alt')).toContainText('ligado')

  // Slider alimenta a ProgressBar.
  await run(rp, 'sld').locator('input').fill('80')
  await expect(run(rp, 'pb').locator('[role=progressbar]')).toHaveAttribute('aria-valuenow', '80')

  // Senha: mascarada, o script lê o valor, e o valor nunca aparece no console.
  const pwd = run(rp, 'pwd').locator('input')
  await expect(pwd).toHaveAttribute('type', 'password')
  await pwd.fill('segredo123')
  await expect(run(rp, 'out')).toContainText('senha com 10 letras')
  expect((await s.consoleLines()).join('\n')).not.toContain('segredo123')

  // Data.
  await run(rp, 'dt').locator('input').fill('2024-02-29')
  await expect(run(rp, 'out')).toContainText('data 2024-02-29')

  // Métodos chamados pelo script.
  await run(rp, 'btn').locator('button').click()
  await expect(run(rp, 'pb').locator('[role=progressbar]')).toHaveAttribute('aria-valuenow', '100')
  await expect(pwd).toHaveAttribute('type', 'text')
  await expect(run(rp, 'dt').locator('input')).toHaveValue(new Date().toLocaleDateString('sv-SE'))
  await expect(run(rp, 'lnk')).toContainText('abrir')

  // Link: endereço http é aceito (nos testes o navegador não abre; a IDE registra no console).
  await run(rp, 'lnk').locator('a').click()
  await expect(s.page.locator('.console-line', { hasText: 'Link aberto: https://www.python.org/' })).toBeVisible()
  await expect(s.page.locator('.console-line.error')).toHaveCount(0)
})

test('Link com endereço perigoso é bloqueado', async () => {
  await s.start()
  await add('Link', 'lnk')
  await writeFile(
    join(s.dir, 'Main.py'),
    `
@form.on_load
def inicio():
    form.lnk.url = "file:///C:/Windows/System32/calc.exe"
    form.lnk.open()
`,
    'utf8'
  )
  await s.runForm()
  await expect(s.page.locator('.console-line.error', { hasText: 'Link bloqueado' })).toBeVisible()
  await expect(s.page.locator('.console-line', { hasText: 'Link aberto' })).toHaveCount(0)
})
