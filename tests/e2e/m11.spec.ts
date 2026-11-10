import { test, expect, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Studio } from './helpers'

const s = new Studio()

test.afterEach(async () => {
  await s.stop()
})

const run = (page: Page, id: string) => page.locator(`[data-run-id="${id}"]`)

test('API comum: ocultar, desabilitar, dica, foco, posição, tamanho e reset na janela de execução', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.setField('id', 'btnA')
  await s.dropFrom('TextField', s.surface, { x: 102, y: 142 })
  await s.setField('id', 'txtB')
  await s.dropFrom('Label', s.surface, { x: 302, y: 62 })
  await s.setField('id', 'lblC')
  await s.setField('text', 'visível')
  await s.dropFrom('Button', s.surface, { x: 302, y: 142 })
  await s.setField('id', 'btnD')
  await s.setField('text', 'Mudar')
  await writeFile(
    join(s.dir, 'Main.py'),
    `
@form.btnA.on_click
def a():
    form.txtB.focus()
    form.lblC.hide()
    form.btnD.disable()
    form.btnD.set_tooltip("Dica nova")
    form.btnD.set_position(200, 220)
    form.btnD.set_size(150, 40)

@form.btnD.on_click
def d():
    pass

@form.lblC.on_click
def c():
    form.lblC.show()
    form.btnD.reset()
`,
    'utf8'
  )
  const rp = await s.runForm()
  await run(rp, 'btnA').locator('button').click()

  await expect(run(rp, 'lblC')).toBeHidden()
  await expect(run(rp, 'btnD').locator('button')).toBeDisabled()
  await expect(run(rp, 'btnD')).toHaveAttribute('title', 'Dica nova')
  await expect.poll(() => rp.evaluate(() => (document.activeElement as HTMLElement | null)?.closest('[data-run-id]')?.getAttribute('data-run-id'))).toBe('txtB')
  const box = await run(rp, 'btnD').evaluate((e) => ({ l: (e as HTMLElement).style.left, t: (e as HTMLElement).style.top, w: (e as HTMLElement).style.width, h: (e as HTMLElement).style.height }))
  expect(box).toEqual({ l: '200px', t: '220px', w: '150px', h: '40px' })
  await expect(s.page.locator('.console-line.error')).toHaveCount(0)
})

test('o autocompletar e o dicionário mostram a API comum; Label não oferece foco', async () => {
  await s.start()
  await s.dropFrom('Label', s.surface, { x: 102, y: 62 })
  await s.setField('id', 'lblA')
  await s.dropFrom('Button', s.surface, { x: 302, y: 62 })
  await s.setField('id', 'btnA')
  await s.page.getByTestId('tab-code-Main').click()
  await s.page.locator('.monaco-editor .view-line').first().waitFor()
  await s.focusEditor()
  await s.page.keyboard.press('Control+End')
  // A lista do Monaco mostra poucas linhas por vez: digita o começo do nome para filtrar.
  const suggest = async (typed: string): Promise<string> => {
    await s.page.keyboard.type(typed, { delay: 15 })
    await s.page.waitForTimeout(400)
    return (await s.suggestionLabels()).join('|')
  }
  expect(await suggest('\nform.btnA.fo')).toContain('focus')
  await s.page.keyboard.press('Escape')
  expect(await suggest('\nform.btnA.set_')).toMatch(/set_tooltip.*set_position|set_position.*set_tooltip/)
  await s.page.keyboard.press('Escape')
  expect(await suggest('\nform.lblA.hi')).toContain('hide')
  await s.page.keyboard.press('Escape')
  const label = await suggest('\nform.lblA.fo')
  expect(label).not.toContain('focus') // Label não recebe foco
})
