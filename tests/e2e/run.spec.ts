import { test, expect, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Studio } from './helpers'

const s = new Studio()

test.afterEach(async () => {
  await s.stop()
})

const run = (page: Page, id: string) => page.locator(`[data-run-id="${id}"]`)
const stopButton = () => s.page.getByRole('button', { name: /Parar/ })
const writeScript = (code: string): Promise<void> => writeFile(join(s.dir, 'Main.py'), code, 'utf8')

/** Monta, pela IDE, um formulário com campo, botão, combo e rótulo (IDs conhecidos). */
async function buildCadastro(): Promise<void> {
  await s.dropFrom('TextField', s.surface, { x: 102, y: 62 })
  await s.setField('id', 'txtNome')
  await s.dropFrom('Button', s.surface, { x: 302, y: 62 })
  await s.setField('id', 'btnAdd')
  await s.setField('text', 'Adicionar')
  await s.dropFrom('ComboBox', s.surface, { x: 102, y: 142 })
  await s.setField('id', 'cbUF')
  await s.dropFrom('Label', s.surface, { x: 302, y: 142 })
  await s.setField('id', 'lblInfo')
  await s.setField('text', 'x')
}

test('F5 executa o formulário: campos reais, eventos, patches do Python e print no console', async () => {
  await s.start()
  await buildCadastro()
  await writeScript(`
@form.on_load
def inicio():
    form.cbUF.clear()          # o ComboBox nasce com 2 itens de exemplo
    form.lblInfo.text = "pronto"
    print("carregou")

@form.btnAdd.on_click
def adicionar():
    nome = form.txtNome.value
    form.cbUF.add_item(nome)
    form.lblInfo.text = f"{len(form.cbUF.items)} item(ns)"
    print("adicionado", nome)

@form.cbUF.on_change
def escolher(ev):
    form.lblInfo.text = "escolheu " + str(form.cbUF.selected_item)
`)

  const rp = await s.runForm()
  // O layout é o do canvas (tamanho do formulário e posição dos componentes).
  expect(await run(rp, 'txtNome').evaluate((e) => ({ x: (e as HTMLElement).offsetLeft, y: (e as HTMLElement).offsetTop }))).toEqual({ x: 104, y: 64 })
  await expect(run(rp, 'btnAdd').locator('button')).toHaveText('Adicionar')
  await expect(run(rp, 'lblInfo').locator('.r-label')).toHaveText('pronto') // patch do on_load
  await expect(s.page.locator('.console-line', { hasText: 'Executando "Main"' })).toBeVisible()
  await expect(s.page.locator('.console-line', { hasText: 'carregou' })).toBeVisible()
  await expect(s.page.getByRole('button', { name: /Parar/ })).toBeEnabled()

  await run(rp, 'txtNome').locator('input').fill('SP')
  await run(rp, 'btnAdd').locator('button').click()
  await expect(run(rp, 'lblInfo').locator('.r-label')).toHaveText('1 item(ns)')
  await expect(run(rp, 'cbUF').locator('option', { hasText: 'SP' })).toHaveCount(1)
  await expect(s.page.locator('.console-line', { hasText: 'adicionado SP' })).toBeVisible()

  await run(rp, 'txtNome').locator('input').fill('RJ')
  await run(rp, 'btnAdd').locator('button').click()
  await expect(run(rp, 'lblInfo').locator('.r-label')).toHaveText('2 item(ns)')

  await run(rp, 'cbUF').locator('select').selectOption({ label: 'RJ' })
  await expect(run(rp, 'lblInfo').locator('.r-label')).toHaveText('escolheu RJ')

  // Fechar a janela de execução encerra tudo e a IDE volta ao normal.
  await rp.close()
  await expect(s.page.locator('.console-line', { hasText: 'Execução encerrada.' })).toBeVisible()
  await expect(stopButton()).toBeDisabled()
})

test('o script é lido do disco a cada execução (edição externa vale na hora)', async () => {
  await s.start()
  await buildCadastro()
  await writeScript('@form.on_load\ndef a(): form.lblInfo.text = "v1"\n')
  let rp = await s.runForm()
  await expect(run(rp, 'lblInfo').locator('.r-label')).toHaveText('v1')

  await writeScript('@form.on_load\ndef a(): form.lblInfo.text = "v2"\n')
  const [rp2] = await Promise.all([s.app.waitForEvent('window'), s.page.keyboard.press('F5')])
  await rp2.waitForSelector('.run-root')
  rp = rp2
  await expect(run(rp, 'lblInfo').locator('.r-label')).toHaveText('v2')
})

test('erros do script vão ao console com a linha, e o formulário continua funcionando', async () => {
  await s.start()
  await buildCadastro()
  await writeScript(
    ['@form.btnAdd.on_click', 'def quebra():', '    form.lblInfo.text = "antes"', '    1 / 0', ''].join('\n')
  )
  const rp = await s.runForm()
  await run(rp, 'btnAdd').locator('button').click()
  const erro = s.page.locator('.console-line.error', { hasText: 'ZeroDivisionError' })
  await expect(erro).toContainText('linha 4')
  await expect(erro).toContainText('1 / 0')
  await expect(run(rp, 'lblInfo').locator('.r-label')).toHaveText('antes') // o que rodou antes do erro vale

  await run(rp, 'btnAdd').locator('button').click() // continua vivo
  await expect(s.page.locator('.console-line.error', { hasText: 'ZeroDivisionError' })).toHaveCount(2)
})

test('erro de sintaxe e ID inexistente são explicados; o formulário abre mesmo assim', async () => {
  await s.start()
  await buildCadastro()
  await writeScript('x = (\n')
  let rp = await s.runForm()
  await expect(s.page.locator('.console-line.error', { hasText: 'SyntaxError' })).toBeVisible()
  await expect(run(rp, 'btnAdd')).toBeVisible()
  await rp.close()

  await writeScript('form.btnAdicionar.text = "x"\n')
  const [rp2] = await Promise.all([s.app.waitForEvent('window'), s.page.keyboard.press('F5')])
  await rp2.waitForSelector('.run-root')
  rp = rp2
  const erro = s.page.locator('.console-line.error', { hasText: "Não há componente com o ID 'btnAdicionar'" })
  await expect(erro).toBeVisible()
  await expect(erro).toContainText('btnAdd') // lista os IDs válidos
  await expect(erro).toContainText('linha 1')
})

test('app.title, app.show_message e app.close controlam a janela', async () => {
  await s.start()
  await buildCadastro()
  await writeScript(`
@form.on_load
def inicio():
    app.title = "Cadastro"

@form.btnAdd.on_click
def sair():
    form.lblInfo.text = "saindo"
    app.show_message("Olá!", "Aviso")
    app.close()
`)
  await s.app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async (...args: unknown[]) => {
      ;(globalThis as unknown as Record<string, unknown>).__msg = args[args.length - 1]
      return { response: 0, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
  })
  const rp = await s.runForm()
  await expect(rp).toHaveTitle('Cadastro')

  const closed = rp.waitForEvent('close')
  await run(rp, 'btnAdd').locator('button').click()
  await closed
  const msg = await s.app.evaluate(() => (globalThis as unknown as Record<string, unknown>).__msg as { message: string; title: string })
  expect(msg).toMatchObject({ message: 'Olá!', title: 'Aviso' })
  await expect(stopButton()).toBeDisabled()
})

test('Parar (botão e Shift+F5) encerra; F5 durante a execução reinicia sem acumular janelas', async () => {
  await s.start()
  await buildCadastro()
  await writeScript('print("rodando")\n')

  const rp1 = await s.runForm()
  await expect(stopButton()).toBeEnabled()
  const closed1 = rp1.waitForEvent('close')
  await stopButton().click()
  await closed1
  await expect(stopButton()).toBeDisabled()

  const rp2 = await s.runForm()
  const [rp3] = await Promise.all([s.app.waitForEvent('window'), s.page.keyboard.press('F5')]) // reinicia
  await rp3.waitForSelector('.run-root')
  await expect.poll(() => rp2.isClosed()).toBe(true)
  expect(s.app.windows()).toHaveLength(2) // a IDE e a execução atual
  await expect(stopButton()).toBeEnabled() // o fim da execução antiga não derrubou o estado da nova

  const closed3 = rp3.waitForEvent('close')
  await s.page.keyboard.press('Shift+F5')
  await closed3
  await expect(stopButton()).toBeDisabled()
})

test('sem Python válido a IDE explica o que fazer, sem abrir janela', async () => {
  await s.start({ VFORM_PYTHON: join(process.cwd(), 'nao-existe', 'python.exe') })
  await s.page.keyboard.press('F5')
  const erro = s.page.locator('.console-line.error', { hasText: 'Python 3.10+ não encontrado' })
  await expect(erro).toBeVisible()
  await expect(erro).toContainText('VFORM_PYTHON')
  expect(s.app.windows()).toHaveLength(1)
  await expect(stopButton()).toBeDisabled()
})

test('todos os tipos de controle funcionam em execução (auto-layout, abas, tabela, estados)', async () => {
  await s.start()
  const n = (
    id: string, type: string, x: number, y: number, width: number, height: number,
    props: Record<string, unknown> = {}, extra: Record<string, unknown> = {}
  ): Record<string, unknown> => ({ id, type, x, y, width, height, props, ...extra })

  const form = {
    format: 'vform-form', version: 1, name: 'Main', title: 'Todos', width: 640, height: 480,
    children: [
      n('chk', 'CheckBox', 20, 20, 140, 24, { text: 'Ativo' }),
      n('rg', 'RadioGroup', 20, 60, 140, 64, { items: ['A', 'B'], selectedIndex: 0 }),
      n('lst', 'ListBox', 200, 20, 140, 80, { items: ['um', 'dois', 'tres'], selectedIndex: -1 }),
      n('txt', 'TextArea', 200, 110, 200, 60, { value: 'olá' }),
      n('out', 'Label', 360, 20, 250, 24, { text: '' }),
      n('tabs', 'Tabs', 20, 150, 300, 160, { tabs: ['T1', 'T2'], selectedIndex: 0 }, {
        children: [
          n('lblT1', 'Label', 8, 8, 120, 24, { text: 'dentro T1' }, { tab: 0 }),
          n('btnT2', 'Button', 8, 8, 100, 28, { text: 'em T2' }, { tab: 1 })
        ]
      }),
      n('tbl', 'Table', 360, 200, 260, 120, { columns: ['n', 'v'] }),
      n('pnl', 'Panel', 20, 330, 300, 120, { layout: 'horizontal', gap: 10, padding: 10 }, {
        children: [n('b1', 'Button', 0, 0, 80, 30, { text: 'B1' }), n('b2', 'Button', 0, 0, 80, 30, { text: 'B2' })]
      })
    ]
  }
  await writeFile(join(s.dir, 'Main.form.json'), JSON.stringify(form, null, 2), 'utf8')
  await writeScript(`
@form.chk.on_change
def a(ev): form.out.text = f"chk={ev.checked}/{form.chk.checked}"

@form.rg.on_change
def b(ev): form.out.text = f"rg={form.rg.selected_item}"

@form.lst.on_change
def c(ev): form.out.text = f"lst={form.lst.selected_index}:{ev.value}"

@form.lst.on_double_click
def d(ev): form.out.text = f"dbl={ev.value}"

@form.txt.on_change
def e(ev): form.out.text = f"txt={form.txt.text}"

@form.tabs.on_change
def f(ev): form.out.text = f"tab={form.tabs.selected_index}"

@form.btnT2.on_click
def g():
    form.out.text = "btnT2"
    form.tbl.add_row([1, "x"])
    form.tbl.add_row([2, "y"])

@form.tbl.on_change
def h(ev): form.out.text = f"row={ev.index}/{form.tbl.selected_index}"

@form.b1.on_click
def i():
    form.b2.enabled = False
    form.b1.x = 5
    form.lblT1.visible = False
    form.chk.x = 60
`)
  await s.page.getByRole('button', { name: 'Abrir', exact: true }).click()
  await expect(s.node('chk')).toBeVisible()

  const rp = await s.runForm()
  const out = run(rp, 'out').locator('.r-label')
  await expect(run(rp, 'txt').locator('textarea')).toHaveValue('olá')
  await expect(run(rp, 'lblT1')).toBeVisible()
  await expect(run(rp, 'btnT2')).toHaveCount(0) // é da aba 2

  await run(rp, 'chk').locator('input').check()
  await expect(out).toHaveText('chk=True/True')
  await run(rp, 'rg').getByText('B', { exact: true }).click()
  await expect(out).toHaveText('rg=B')
  await run(rp, 'lst').getByText('dois').click()
  await expect(out).toHaveText('lst=1:dois')
  await run(rp, 'lst').getByText('tres').dblclick()
  await expect(out).toHaveText('dbl=tres')
  await run(rp, 'txt').locator('textarea').fill('novo')
  await expect(out).toHaveText('txt=novo')

  await run(rp, 'tabs').locator('.r-tab', { hasText: 'T2' }).click()
  await expect(out).toHaveText('tab=1')
  await expect(run(rp, 'lblT1')).toHaveCount(0)
  await run(rp, 'btnT2').locator('button').click()
  await expect(run(rp, 'tbl').locator('tbody tr')).toHaveCount(2)
  await run(rp, 'tbl').locator('tbody tr').nth(1).click()
  await expect(out).toHaveText('row=1/1')

  await run(rp, 'tabs').locator('.r-tab', { hasText: 'T1' }).click()
  await expect(out).toHaveText('tab=0')
  // Auto-layout horizontal do Panel: margem 10, espaço 10, largura 80.
  const left = (id: string): Promise<number> => run(rp, id).evaluate((e) => (e as HTMLElement).offsetLeft)
  expect([await left('b1'), await left('b2')]).toEqual([10, 100])

  await run(rp, 'b1').locator('button').click()
  await expect(run(rp, 'b2').locator('button')).toBeDisabled()
  await expect(run(rp, 'lblT1')).toBeHidden() // visible = False no script
  expect(await left('chk')).toBe(60) // x alterado em execução
  expect(await left('b1')).toBe(10) // em auto-layout o x não vale: o Panel posiciona
})
