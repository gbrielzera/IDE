import { test, expect, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Studio } from './helpers'

const s = new Studio()
let page: Page
let dir: string
let surface: Locator

const node = (id: string): Locator => s.node(id)
const palette = (type: string): Locator => s.palette(type)
const geometry = (id: string): ReturnType<Studio['geometry']> => s.geometry(id)
const mouseDrag = (a: { x: number; y: number }, b: { x: number; y: number }): Promise<void> => s.mouseDrag(a, b)
const center = Studio.center
const dropFrom = (type: string, target: Locator, pos: { x: number; y: number }): Promise<void> =>
  s.dropFrom(type, target, pos)

test.beforeEach(async () => {
  await s.start()
  ;({ page, dir, surface } = s)
})

test.afterEach(async () => {
  await s.stop()
})

test('arrastar da paleta cria o componente com ID automático, encaixado na grade', async () => {
  // Coordenadas longe do meio da célula da grade (8px), para o arredondamento ser estável.
  await dropFrom('Button', surface, { x: 102, y: 62 })

  await expect(node('button1')).toBeVisible()
  expect(await geometry('button1')).toEqual({ x: 104, y: 64, w: 96, h: 30 })
  await expect(node('button1')).toHaveClass(/selected/)
  await expect(page.getByTestId('tree-button1')).toBeVisible()
  await expect(page.getByTestId('prop-id')).toHaveValue('button1')

  await dropFrom('Button', surface, { x: 302, y: 202 })
  await expect(node('button2')).toBeVisible()

  // Dois cliques na paleta também adicionam.
  await palette('Label').dblclick()
  await expect(node('label1')).toBeVisible()
})

test('mover, redimensionar, desfazer e refazer', async () => {
  await dropFrom('Button', surface, { x: 102, y: 62 })
  const start = await geometry('button1')

  // Mover +50,+30 → encaixa em (152, 96).
  const c = await center(node('button1'))
  await mouseDrag(c, { x: c.x + 50, y: c.y + 30 })
  expect(await geometry('button1')).toMatchObject({ x: 152, y: 96 })

  // Redimensionar pela alça sudeste.
  const h = await center(page.locator('[data-node-id="button1"] .handle-se'))
  await mouseDrag(h, { x: h.x + 40, y: h.y + 20 })
  expect(await geometry('button1')).toEqual({ x: 152, y: 96, w: 136, h: 48 })

  // Cada gesto é UMA entrada no histórico.
  await page.keyboard.press('Control+z')
  expect(await geometry('button1')).toEqual({ x: 152, y: 96, w: 96, h: 30 })
  await page.keyboard.press('Control+z')
  expect(await geometry('button1')).toEqual(start)
  await page.keyboard.press('Control+y')
  expect(await geometry('button1')).toMatchObject({ x: 152, y: 96 })
  await page.keyboard.press('Control+Shift+z')
  expect(await geometry('button1')).toEqual({ x: 152, y: 96, w: 136, h: 48 })

  // Setas movem 1px e Shift+seta move 10px.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  expect(await geometry('button1')).toMatchObject({ x: 153, y: 106 })
})

test('o arraste fica preso ao canvas e bloqueia arraste nativo (não "solta" após poucos pixels)', async () => {
  await dropFrom('Button', surface, { x: 102, y: 62 })
  const hasCapture = (): Promise<boolean> =>
    page.evaluate(() => (document.querySelector('[data-testid="surface"]') as HTMLElement).hasPointerCapture(1))

  const c = await center(node('button1'))
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x + 3, c.y + 1) // 1º movimento curto: antes parava aqui
  expect(await hasCapture()).toBe(true)
  await page.mouse.move(c.x + 90, c.y + 50, { steps: 30 })
  expect(await geometry('button1')).toMatchObject({ x: 192, y: 112 })
  await page.mouse.up()
  expect(await hasCapture()).toBe(false)

  // Nenhum arraste nativo pode começar dentro do canvas (ele cancelaria o ponteiro).
  const prevented = await node('button1').evaluate((el) => {
    const ev = new DragEvent('dragstart', { bubbles: true, cancelable: true })
    el.dispatchEvent(ev)
    return ev.defaultPrevented
  })
  expect(prevented).toBe(true)
})

test('soltar no Panel e arrastar para dentro dele muda o pai e mantém a posição', async () => {
  await dropFrom('Panel', surface, { x: 302, y: 202 })
  await dropFrom('Label', node('panel1'), { x: 22, y: 22 })
  await expect(page.locator('[data-node-id="panel1"] > .children-layer > [data-node-id="label1"]')).toBeVisible()
  expect(await geometry('label1')).toMatchObject({ x: 24, y: 24 })

  // Botão solto no formulário e depois arrastado para dentro do painel.
  await dropFrom('Button', surface, { x: 42, y: 42 })
  await expect(page.locator('.form-surface > [data-node-id="button1"]')).toBeVisible()
  const target = await center(node('panel1'))
  await mouseDrag(await center(node('button1')), target)
  await expect(page.locator('[data-node-id="panel1"] > .children-layer > [data-node-id="button1"]')).toBeVisible()
  await expect(page.getByTestId('tree-button1')).toBeVisible()

  // Arrastar de volta para fora do painel.
  const box = (await surface.boundingBox())!
  await mouseDrag(await center(node('button1')), { x: box.x + 60, y: box.y + 60 })
  await expect(page.locator('.form-surface > [data-node-id="button1"]')).toBeVisible()

  // Desfazer o último gesto devolve o botão ao painel numa só ação.
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-node-id="panel1"] > .children-layer > [data-node-id="button1"]')).toBeVisible()
})

test('seleção em retângulo, duplicar com Ctrl+D e excluir com Delete', async () => {
  await palette('Label').dblclick()
  await palette('Button').dblclick()
  await palette('TextField').dblclick()
  await expect(page.locator('.node')).toHaveCount(3)

  const box = (await surface.boundingBox())!
  await mouseDrag({ x: box.x + 360, y: box.y + 300 }, { x: box.x + 4, y: box.y + 4 })
  await expect(page.getByTestId('properties')).toContainText('3 componentes selecionados')

  await page.keyboard.press('Control+d')
  await expect(page.locator('.node')).toHaveCount(6)
  await expect(page.getByTestId('tree-label2')).toBeVisible()
  await expect(page.getByTestId('properties')).toContainText('3 componentes selecionados')

  await page.keyboard.press('Delete')
  await expect(page.locator('.node')).toHaveCount(3)
  await page.keyboard.press('Control+z')
  await expect(page.locator('.node')).toHaveCount(6)

  // Clique no vazio limpa a seleção; Shift+clique alterna.
  await page.mouse.click(box.x + 380, box.y + 330)
  await expect(page.getByTestId('properties')).toContainText('Form')
  await node('label1').click()
  await node('button1').click({ modifiers: ['Shift'] })
  await expect(page.getByTestId('properties')).toContainText('2 componentes selecionados')
})

test('salvar e reabrir preserva os componentes', async () => {
  await dropFrom('Panel', surface, { x: 202, y: 102 })
  await dropFrom('ComboBox', node('panel1'), { x: 18, y: 18 })
  await page.keyboard.press('Control+s')
  await expect(page.locator('.console-line').last()).toContainText('Projeto salvo')
  await expect(page.locator('.statusbar')).toContainText('salvo')

  const form = JSON.parse(await readFile(join(dir, 'Main.form.json'), 'utf8'))
  expect(form.children).toHaveLength(1)
  expect(form.children[0]).toMatchObject({ id: 'panel1', type: 'Panel', x: 200, y: 104 })
  expect(form.children[0].children[0]).toMatchObject({
    id: 'comboBox1',
    type: 'ComboBox',
    x: 16,
    y: 16,
    props: { items: ['Item 1', 'Item 2'], selectedIndex: -1 }
  })

  await page.getByRole('button', { name: 'Abrir', exact: true }).click()
  await expect(page.locator('[data-node-id="panel1"] > .children-layer > [data-node-id="comboBox1"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Desfazer' })).toBeDisabled()
})
