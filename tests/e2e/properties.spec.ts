import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Studio } from './helpers'

const s = new Studio()

test.beforeEach(async () => {
  await s.start()
})

test.afterEach(async () => {
  await s.stop()
})

/** IDs dos filhos diretos de um container, na ordem do DOM (= ordem do arquivo). */
const order = (parent: string): Promise<string[]> =>
  s.page
    .locator(`[data-node-id="${parent}"] > .children-layer > .node`)
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.nodeId ?? ''))

/** Ponto vazio do formulário (clicar ali limpa a seleção). */
async function emptySpot(): Promise<[number, number]> {
  const b = (await s.surface.boundingBox())!
  return [b.x + b.width - 30, b.y + b.height - 30]
}

test('editar o texto pelo painel atualiza o canvas, é desfazível, e Esc cancela', async () => {
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  const label = s.node('button1').locator('.cmp-button')
  await expect(label).toHaveText('Button')

  await s.setField('text', 'Salvar')
  await expect(label).toHaveText('Salvar')
  await s.page.keyboard.press('Control+z')
  await expect(label).toHaveText('Button')
  await s.page.keyboard.press('Control+y')
  await expect(label).toHaveText('Salvar')

  // Esc descarta o que foi digitado.
  await s.prop('text').fill('lixo')
  await s.prop('text').press('Escape')
  await expect(s.prop('text')).toHaveValue('Salvar')
  await expect(label).toHaveText('Salvar')
})

test('renomear o ID valida palavra reservada, formato e duplicidade', async () => {
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.dropFrom('Button', s.surface, { x: 302, y: 202 })
  await s.node('button1').click()

  await s.setField('id', 'btnSalvar')
  await expect(s.node('btnSalvar')).toBeVisible()
  await expect(s.tree('btnSalvar')).toBeVisible()
  await expect(s.prop('id-error')).toHaveCount(0)

  await s.setField('id', 'class')
  await expect(s.prop('id-error')).toContainText('reservada')
  await expect(s.node('btnSalvar')).toBeVisible() // continua com o ID antigo

  await s.setField('id', '9x')
  await expect(s.prop('id-error')).toContainText('letras')

  await s.setField('id', 'button2')
  await expect(s.prop('id-error')).toContainText('Já existe')

  // O erro some quando a pessoa volta a editar.
  await s.prop('id').fill('btnOk')
  await expect(s.prop('id-error')).toHaveCount(0)
  await s.prop('id').press('Enter')
  await expect(s.node('btnOk')).toBeVisible()

  // Renomear e desfazer mantém o componente selecionado, com o painel dele aberto.
  await s.page.keyboard.press('Control+z')
  await expect(s.node('btnSalvar')).toHaveClass(/selected/)
  await expect(s.prop('id')).toHaveValue('btnSalvar')
})

test('posição e tamanho: números são limitados e valores inválidos voltam ao anterior', async () => {
  await s.dropFrom('Label', s.surface, { x: 102, y: 62 })
  await s.setField('x', '40')
  await s.setField('y', '24')
  await s.setField('width', '200')
  expect(await s.geometry('label1')).toMatchObject({ x: 40, y: 24, w: 200 })

  await s.setField('width', '3') // mínimo 8
  expect((await s.geometry('label1')).w).toBe(8)
  await s.setField('x', '-50') // mínimo 0
  expect((await s.geometry('label1')).x).toBe(0)

  await s.prop('y').fill('')
  await s.prop('y').press('Enter')
  await expect(s.prop('y')).toHaveValue('24') // vazio volta ao valor atual
  expect((await s.geometry('label1')).y).toBe(24)
})

test('estado e aparência: habilitado, visível, fonte e cores; só o que muda vai para o arquivo', async () => {
  await s.dropFrom('Label', s.surface, { x: 102, y: 62 })
  const cmp = s.node('label1').locator('.cmp')

  await s.prop('enabled').uncheck()
  await expect(s.node('label1')).toHaveClass(/is-disabled/)
  await s.prop('visible').uncheck()
  await expect(s.node('label1')).toHaveClass(/is-hidden/)
  await s.prop('visible').check()
  await expect(s.node('label1')).not.toHaveClass(/is-hidden/)

  await s.prop('bold').check()
  await s.setField('fontSize', '20')
  expect(await cmp.evaluate((e) => getComputedStyle(e).fontSize)).toBe('20px')
  expect(await cmp.evaluate((e) => getComputedStyle(e).fontWeight)).toBe('700')

  await s.setField('background', '#ffcc00')
  expect(await cmp.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 204, 0)')
  await s.setField('background', 'vermelho') // inválido: ignorado
  expect(await cmp.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 204, 0)')
  await s.page.getByTestId('properties').getByRole('button', { name: 'limpar' }).last().click()
  expect(await cmp.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)')

  await s.prop('enabled').check() // volta ao padrão
  await s.page.keyboard.press('Control+s')
  await expect(s.page.locator('.console-line').last()).toContainText('Projeto salvo')
  const form = JSON.parse(await readFile(join(s.dir, 'Main.form.json'), 'utf8'))
  // Só o que difere do padrão é gravado (enabled e visible voltaram ao padrão e foram omitidos).
  expect(form.children[0].props).toEqual({ text: 'Label', align: 'left', bold: true, fontSize: 20 })
})

test('lista de itens e índice selecionado aparecem no componente', async () => {
  await s.dropFrom('ComboBox', s.surface, { x: 102, y: 62 })
  await s.prop('items').fill('SP\nRJ\n\nMG')
  await s.prop('items').blur()
  await s.setField('selectedIndex', '1')
  await expect(s.node('comboBox1').locator('.cmp-combo')).toContainText('RJ')

  await s.prop('items').fill('A\nB')
  await s.prop('items').blur()
  await expect(s.prop('items')).toHaveValue('A\nB')
  await s.setField('selectedIndex', '9') // fora da lista: o combo fica vazio
  await expect(s.node('comboBox1').locator('.cmp-combo')).not.toContainText('A')
})

test('formulário: título e tamanho', async () => {
  await s.page.mouse.click(...(await emptySpot()))
  await s.setField('title', 'Cadastro')
  await expect(s.page.locator('.form-title-text')).toHaveText('Cadastro')

  await s.setField('form-width', '800')
  await s.setField('form-height', '520')
  expect(await s.page.locator('.form-frame').evaluate((e) => (e as HTMLElement).offsetWidth)).toBe(800)
  expect(await s.surface.evaluate((e) => (e as HTMLElement).offsetHeight)).toBe(520)
  await s.setField('form-width', '5') // mínimo 100
  expect(await s.page.locator('.form-frame').evaluate((e) => (e as HTMLElement).offsetWidth)).toBe(100)
})

test.describe('auto-layout do Panel', () => {
  async function panelVertical(): Promise<void> {
    await s.dropFrom('Panel', s.surface, { x: 302, y: 202 })
    await s.prop('layout').selectOption('vertical')
  }

  test('soltar insere na posição do ponteiro; espaçamento, margem e alinhamento valem', async () => {
    await panelVertical()
    const panel = s.node('panel1')
    await s.dropFrom('Button', panel, { x: 22, y: 22 })
    await s.dropFrom('Label', panel, { x: 22, y: 120 }) // abaixo do botão: vai para o fim
    await s.dropFrom('TextField', panel, { x: 22, y: 3 }) // acima do botão: vai para o início
    expect(await order('panel1')).toEqual(['textField1', 'button1', 'label1'])

    // margem 8 e espaço 8: 8, 8+28+8, 44+30+8
    expect((await s.geometry('textField1')).y).toBe(8)
    expect((await s.geometry('button1')).y).toBe(44)
    expect((await s.geometry('label1')).y).toBe(82)
    expect(await s.node('button1').evaluate((e) => getComputedStyle(e).position)).toBe('relative')

    await panel.click({ position: { x: 200, y: 140 } }) // vazio do painel: seleciona o painel
    await s.setField('gap', '0')
    await s.setField('padding', '0')
    expect((await s.geometry('textField1')).y).toBe(0)
    expect((await s.geometry('button1')).y).toBe(28)

    await s.prop('align').selectOption('stretch')
    expect((await s.geometry('button1')).w).toBe(240) // preenche a largura do painel (margem 0)

    await s.prop('layout').selectOption('horizontal')
    expect((await s.geometry('textField1')).x).toBe(0)
    expect((await s.geometry('button1')).x).toBe(160) // largura do primeiro (160) + espaço 0
  })

  test('reordenar arrastando, com as setas, e tirar o item do painel', async () => {
    await panelVertical()
    const panel = s.node('panel1')
    await s.dropFrom('Button', panel, { x: 22, y: 22 })
    await s.dropFrom('Label', panel, { x: 22, y: 120 })
    await s.dropFrom('TextField', panel, { x: 22, y: 120 })
    expect(await order('panel1')).toEqual(['button1', 'label1', 'textField1'])

    // Arrasta o último item até o topo do painel: vira o primeiro (reordena ao vivo).
    const pb = (await panel.boundingBox())!
    await s.mouseDrag(await Studio.center(s.node('textField1')), { x: pb.x + 60, y: pb.y + 3 })
    expect(await order('panel1')).toEqual(['textField1', 'button1', 'label1'])
    await s.page.keyboard.press('Control+z') // um único desfazer para o gesto todo
    expect(await order('panel1')).toEqual(['button1', 'label1', 'textField1'])

    // Setas: ↓ desce um lugar, ↑ sobe (eixo do layout); ← → não fazem nada num layout vertical.
    await s.node('button1').click()
    await s.page.keyboard.press('ArrowDown')
    expect(await order('panel1')).toEqual(['label1', 'button1', 'textField1'])
    await s.page.keyboard.press('ArrowRight')
    expect(await order('panel1')).toEqual(['label1', 'button1', 'textField1'])
    await s.page.keyboard.press('ArrowUp')
    await s.page.keyboard.press('ArrowUp') // já é o primeiro: não quebra
    expect(await order('panel1')).toEqual(['button1', 'label1', 'textField1'])

    // Tirar o item do painel: ele vira filho do formulário onde o ponteiro soltou.
    const sb = (await s.surface.boundingBox())!
    await s.mouseDrag(await Studio.center(s.node('label1')), { x: sb.x + 80, y: sb.y + 60 })
    await expect(s.page.locator('.form-surface > [data-node-id="label1"]')).toBeVisible()
    const g = await s.geometry('label1')
    expect(g.x).toBeGreaterThanOrEqual(0)
    expect(g.x).toBeLessThan(80)
    expect(g.y).toBeLessThan(80)
    expect(await order('panel1')).toEqual(['button1', 'textField1'])
  })

  test('soltar um item solto dentro de um Panel em auto-layout o insere na ordem', async () => {
    await panelVertical()
    const panel = s.node('panel1')
    await s.dropFrom('Button', panel, { x: 22, y: 22 })
    await s.dropFrom('Label', s.surface, { x: 42, y: 42 })
    const pb = (await panel.boundingBox())!
    await s.mouseDrag(await Studio.center(s.node('label1')), { x: pb.x + 60, y: pb.y + 3 })
    await expect(s.childOf('panel1', 'label1')).toBeVisible()
    expect(await order('panel1')).toEqual(['label1', 'button1'])
  })
})

test.describe('Tabs com conteúdo por aba', () => {
  test('cada aba tem seus componentes; clicar no cabeçalho troca de aba', async () => {
    await s.dropFrom('Tabs', s.surface, { x: 102, y: 62 })
    const tabs = s.node('tabs1')
    await s.dropFrom('Label', tabs, { x: 30, y: 70 })
    await expect(s.childOf('tabs1', 'label1')).toBeVisible()
    await expect(s.tree('label1')).toContainText('aba 1')

    await tabs.locator('[data-tab-index="1"]').click()
    await expect(s.childOf('tabs1', 'label1')).toHaveCount(0) // é da aba 1
    await expect(s.prop('selectedIndex')).toHaveValue('1')
    await expect(tabs.locator('.cmp-tab.on')).toHaveText('Aba 2')

    await s.dropFrom('Button', tabs, { x: 30, y: 70 })
    await expect(s.childOf('tabs1', 'button1')).toBeVisible()
    await expect(s.tree('button1')).toContainText('aba 2')

    await tabs.locator('[data-tab-index="0"]').click()
    await expect(s.childOf('tabs1', 'label1')).toBeVisible()
    await expect(s.childOf('tabs1', 'button1')).toHaveCount(0)

    // O corpo da aba começa abaixo do cabeçalho: o primeiro filho nunca invade as abas.
    const lb = (await s.node('label1').boundingBox())!
    const tb = (await tabs.boundingBox())!
    expect(lb.y).toBeGreaterThanOrEqual(tb.y + 24)
  })

  test('editar a lista de abas muda os cabeçalhos; tirar um item da aba e devolver', async () => {
    await s.dropFrom('Tabs', s.surface, { x: 102, y: 62 })
    await s.prop('tabs').fill('Geral\nAvançado\nSobre')
    await s.prop('tabs').blur()
    await expect(s.node('tabs1').locator('.cmp-tab')).toHaveText(['Geral', 'Avançado', 'Sobre'])

    await s.dropFrom('Label', s.node('tabs1'), { x: 30, y: 70 })
    const sb = (await s.surface.boundingBox())!
    await s.mouseDrag(await Studio.center(s.node('label1')), { x: sb.x + 40, y: sb.y + 400 })
    await expect(s.page.locator('.form-surface > [data-node-id="label1"]')).toBeVisible()
    await expect(s.tree('label1')).not.toContainText('aba')

    await s.mouseDrag(await Studio.center(s.node('label1')), await Studio.center(s.node('tabs1')))
    await expect(s.childOf('tabs1', 'label1')).toBeVisible()
  })
})

test('salvar e reabrir preserva propriedades, auto-layout, abas e ordem', async () => {
  await s.dropFrom('Panel', s.surface, { x: 22, y: 62 })
  await s.prop('layout').selectOption('horizontal')
  await s.dropFrom('Button', s.node('panel1'), { x: 22, y: 22 })
  await s.setField('text', 'Salvar')
  await s.dropFrom('CheckBox', s.node('panel1'), { x: 220, y: 22 }) // à direita do botão: fica depois
  await s.setField('id', 'chkAtivo')

  await s.dropFrom('Tabs', s.surface, { x: 322, y: 62 })
  await s.node('tabs1').locator('[data-tab-index="1"]').click()
  await s.dropFrom('Label', s.node('tabs1'), { x: 30, y: 70 })

  await s.page.keyboard.press('Control+s')
  await expect(s.page.locator('.console-line').last()).toContainText('Projeto salvo')
  const form = JSON.parse(await readFile(join(s.dir, 'Main.form.json'), 'utf8'))
  const panel = form.children.find((c: { id: string }) => c.id === 'panel1')
  expect(panel.props.layout).toBe('horizontal')
  expect(panel.children.map((c: { id: string }) => c.id)).toEqual(['button1', 'chkAtivo'])
  const tabs = form.children.find((c: { id: string }) => c.id === 'tabs1')
  expect(tabs.props.selectedIndex).toBe(1)
  expect(tabs.children[0]).toMatchObject({ id: 'label1', tab: 1 })

  await s.page.getByRole('button', { name: 'Abrir', exact: true }).click()
  await expect(s.childOf('panel1', 'chkAtivo')).toBeVisible()
  expect(await order('panel1')).toEqual(['button1', 'chkAtivo'])
  await expect(s.node('button1').locator('.cmp-button')).toHaveText('Salvar')
  await expect(s.childOf('tabs1', 'label1')).toBeVisible() // aba 2 continua selecionada
  await expect(s.page.getByRole('button', { name: 'Desfazer' })).toBeDisabled()
})
