import { test, expect, type Page } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { launchApp, Studio } from './helpers'

const s = new Studio()

test.afterEach(async () => {
  await s.stop()
})

const run = (page: Page, id: string) => page.locator(`[data-run-id="${id}"]`)
const readJson = async (path: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(path, 'utf8'))
const formFile = (): Promise<{ children: { id: string; x: number; y: number }[] }> =>
  readJson(join(s.dir, 'Main.form.json')) as never

async function menu(name: string, item: RegExp): Promise<void> {
  await s.page.getByRole('button', { name, exact: true }).click()
  await s.page.getByRole('menuitem', { name: item }).click()
}

test('a última pasta do projeto é lembrada entre execuções do app', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'vform-keep-'))
  try {
    await s.start({}, profile)
    const projectDir = s.dir
    await expect
      .poll(async () => (await readJson(join(profile, 'settings.json'))).lastDir, { timeout: 8000 })
      .toBe(projectDir)
    await s.stop() // fecha o app (o perfil é nosso e fica)

    // Outra execução do app, com o mesmo perfil: os dois seletores abrem onde o último projeto estava.
    const { app, cleanup } = await launchApp({}, profile)
    try {
      const page = await app.firstWindow()
      await page.waitForSelector('.welcome')
      await app.evaluate(({ dialog }) => {
        dialog.showOpenDialog = (async (...args: unknown[]) => {
          ;(globalThis as unknown as Record<string, unknown>).__opts = args[args.length - 1]
          return { canceled: true, filePaths: [] }
        }) as typeof dialog.showOpenDialog
      })
      const lastOptions = (): Promise<{ defaultPath?: string; properties: string[] }> =>
        app.evaluate(() => (globalThis as unknown as Record<string, unknown>).__opts as never)

      await page.getByRole('button', { name: 'Abrir', exact: true }).click()
      await expect.poll(async () => (await lastOptions())?.defaultPath).toBe(projectDir)
      await page.getByRole('button', { name: 'Novo', exact: true }).click()
      await expect.poll(async () => (await lastOptions())?.properties).toContain('openDirectory')
      expect((await lastOptions()).defaultPath).toBe(dirname(projectDir)) // novo projeto: ao lado do último
    } finally {
      await cleanup()
    }
  } finally {
    await rm(profile, { recursive: true, force: true })
  }
})

test('salvamento automático: grava sozinho, sem poluir o console, e a preferência persiste', async () => {
  await s.start()
  await menu('Arquivo', /Salvar automaticamente/)
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await expect.poll(async () => (await formFile()).children.length, { timeout: 10_000 }).toBe(1)
  await expect(s.page.locator('.statusbar')).toContainText('salvo')
  await expect(s.page.locator('.statusbar')).not.toContainText('não salvo')
  await expect(s.page.locator('.console-line', { hasText: 'Projeto salvo' })).toHaveCount(0) // silencioso
  await expect.poll(async () => (await readJson(join(s.profile, 'settings.json'))).autosave).toBe(true)

  await s.page.getByRole('button', { name: 'Arquivo', exact: true }).click()
  await expect(s.page.getByRole('menuitem', { name: /✓ Salvar automaticamente/ })).toBeVisible()
})

test('tema claro 20% menos claro e botão de modo noturno que vira modo claro', async () => {
  await s.start()
  const background = (): Promise<string> => s.page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(await background()).toBe('rgb(195, 193, 185)') // #c3c1b9 (antes #f0efea)

  const night = s.page.getByTestId('toggle-night')
  await expect(night).toHaveText('☾ Modo noturno')
  await night.click()
  await expect(s.page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(night).toHaveText('☀ Modo claro')
  await s.page.getByRole('button', { name: 'Exibir', exact: true }).click()
  await expect(s.page.getByRole('menuitem', { name: /✓ Modo noturno/ })).toBeVisible() // o menu acompanha
  await s.page.keyboard.press('Escape')

  await night.click()
  await expect(s.page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await background()).toBe('rgb(195, 193, 185)')
})

test('componentes não saem da área do formulário (soltar, arrastar, redimensionar e digitar)', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 626, y: 476 }) // quase no canto inferior direito
  expect(await s.geometry('button1')).toMatchObject({ x: 544, y: 450 }) // 640-96 e 480-30

  const sb = (await s.surface.boundingBox())!
  const c = await Studio.center(s.node('button1'))
  await s.mouseDrag(c, { x: sb.x + sb.width + 150, y: sb.y + sb.height + 150 })
  expect(await s.geometry('button1')).toMatchObject({ x: 544, y: 450 })
  await s.mouseDrag(await Studio.center(s.node('button1')), { x: sb.x - 150, y: sb.y - 100 })
  expect(await s.geometry('button1')).toMatchObject({ x: 0, y: 0 })

  await s.setField('x', '500')
  await s.setField('y', '400')
  const h = await Studio.center(s.page.locator('[data-node-id="button1"] .handle-se'))
  await s.mouseDrag(h, { x: h.x + 300, y: h.y + 300 })
  expect(await s.geometry('button1')).toMatchObject({ x: 500, y: 400, w: 140, h: 80 }) // até a borda: 640-500, 480-400

  await s.setField('x', '9999')
  expect((await s.geometry('button1')).x).toBe(500) // largura 140 → 640-140
  await s.setField('width', '3000')
  expect((await s.geometry('button1')).w).toBe(640)
})

test('o formulário se redimensiona pelas bordas e nunca encolhe além dos componentes', async () => {
  await s.start()
  // Medidas da ÁREA ÚTIL (sem a moldura): são as mesmas do formulário em execução.
  const frameWidth = (): Promise<number> => s.surface.evaluate((e) => e.clientWidth)
  const surfaceHeight = (): Promise<number> => s.surface.evaluate((e) => e.clientHeight)
  expect([await frameWidth(), await surfaceHeight()]).toEqual([640, 480])

  const corner = await Studio.center(s.page.getByTestId('grip-se'))
  await s.mouseDrag(corner, { x: corner.x + 40, y: corner.y + 20 }) // centralizado: a largura cresce o dobro
  expect([await frameWidth(), await surfaceHeight()]).toEqual([720, 504]) // a altura encaixa na grade de 8px (480+20 → 504)

  await s.dropFrom('Button', s.surface, { x: 502, y: 62 })
  await s.setField('x', '500')
  const edge = await Studio.center(s.page.getByTestId('grip-e'))
  await s.mouseDrag(edge, { x: edge.x - 400, y: edge.y })
  expect(await frameWidth()).toBe(596) // 500 + 96: o botão não fica de fora

  await s.page.getByTestId('grip-s').hover()
  await s.surface.click({ position: { x: 10, y: 300 } })
  await expect(s.prop('form-width')).toHaveValue('596')
})

test('réguas: mostram a escala do formulário e podem ser desligadas (a escolha persiste)', async () => {
  await s.start()
  await expect(s.page.getByTestId('ruler-h')).toBeVisible()
  await expect(s.page.getByTestId('ruler-h')).toContainText('100')
  await expect(s.page.getByTestId('ruler-v')).toContainText('400')
  await menu('Exibir', /Réguas/)
  await expect(s.page.getByTestId('ruler-h')).toHaveCount(0)
  await expect.poll(async () => (await readJson(join(s.profile, 'settings.json'))).rulers).toBe(false)
  await menu('Exibir', /Réguas/)
  await expect(s.page.getByTestId('ruler-v')).toBeVisible()
})

test('guias inteligentes: a borda gruda na do vizinho (mesmo fora da grade) e a linha aparece', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.setField('x', '100') // 100 não é múltiplo de 8: só a guia explica um encaixe exato nele
  await s.dropFrom('Button', s.surface, { x: 302, y: 202 })
  const c = await Studio.center(s.node('button2'))
  const startX = (await s.geometry('button2')).x

  await s.page.mouse.move(c.x, c.y)
  await s.page.mouse.down()
  await s.page.mouse.move(c.x - (startX - 102), c.y, { steps: 10 }) // a borda esquerda chega perto de 102
  // Os dois botões têm a mesma largura: esquerda, centro e direita alinham juntos, e as três linhas aparecem.
  await expect(s.page.locator('.guide-v')).toHaveCount(3)
  await s.page.mouse.up()
  await expect(s.page.locator('.guide')).toHaveCount(0) // somem ao soltar
  expect((await s.geometry('button2')).x).toBe(100) // a grade daria 96 ou 104

  // Alt desliga as guias e a grade: movimento livre, pixel a pixel.
  const c2 = await Studio.center(s.node('button2'))
  await s.page.keyboard.down('Alt')
  await s.mouseDrag(c2, { x: c2.x + 7, y: c2.y })
  await s.page.keyboard.up('Alt')
  expect((await s.geometry('button2')).x).toBe(107) // sem grade e sem guia (100 + 7)
})

test('Organizar: alinha e distribui os selecionados, e desabilita o que não cabe', async () => {
  await s.start()
  const place = async (type: string, id: string, at: { x: number; y: number }, x: number, y: number): Promise<void> => {
    await s.dropFrom(type, s.surface, at)
    await s.setField('id', id)
    await s.setField('x', String(x))
    await s.setField('y', String(y))
  }
  await place('Button', 'a', { x: 102, y: 62 }, 20, 40)
  await place('Button', 'b', { x: 302, y: 142 }, 200, 100)
  await place('Button', 'c', { x: 502, y: 222 }, 500, 160)
  await s.node('a').click()
  await s.node('b').click({ modifiers: ['Shift'] })

  // Com 2 selecionados dá para alinhar, mas não para distribuir.
  await s.page.getByRole('button', { name: 'Organizar', exact: true }).click()
  await expect(s.page.getByRole('menuitem', { name: /Alinhar à esquerda/ })).toBeEnabled()
  await expect(s.page.getByRole('menuitem', { name: /Distribuir na horizontal/ })).toBeDisabled()
  await s.page.keyboard.press('Escape')

  await s.node('c').click({ modifiers: ['Shift'] })
  await menu('Organizar', /Distribuir na horizontal/)
  // larguras 96: vão de 20 a 596; espaço = (576-288)/2 = 144 → b em 20+96+144
  expect((await s.geometry('b')).x).toBe(260)
  expect((await s.geometry('a')).x).toBe(20)
  expect((await s.geometry('c')).x).toBe(500)

  await menu('Organizar', /Alinhar à esquerda/)
  for (const id of ['a', 'b', 'c']) expect((await s.geometry(id)).x).toBe(20)
  await menu('Organizar', /Alinhar à base/)
  const bottoms = await Promise.all(['a', 'b', 'c'].map(async (id) => (await s.geometry(id)).y + 30))
  expect(new Set(bottoms).size).toBe(1)

  await s.page.keyboard.press('Control+z') // alinhar à base: um único desfazer
  expect(new Set(await Promise.all(['a', 'b', 'c'].map(async (id) => (await s.geometry(id)).y))).size).toBe(3)
})

test('copiar, colar e recortar componentes (atalhos e menu)', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.setField('text', 'Copiado')
  await s.node('button1').click()

  await s.page.keyboard.press('Control+c')
  await s.page.keyboard.press('Control+v')
  await expect(s.node('button2')).toBeVisible()
  await expect(s.node('button2')).toHaveClass(/selected/)
  await expect(s.node('button2').locator('.cmp-button')).toHaveText('Copiado')
  expect(await s.geometry('button2')).toMatchObject({ x: 120, y: 80 }) // 104+16, 64+16 → grade? posição exata +16
  await s.page.keyboard.press('Control+v')
  await expect(s.node('button3')).toBeVisible()
  expect((await s.geometry('button3')).x).toBe(136) // a 2ª colagem se afasta mais

  await s.page.keyboard.press('Control+x') // recorta a cópia selecionada
  await expect(s.node('button3')).toHaveCount(0)
  await menu('Editar', /Colar/)
  await expect(s.node('button3')).toBeVisible() // colou de volta o que foi recortado
  await s.page.keyboard.press('Control+z')
  await expect(s.node('button3')).toHaveCount(0)
})

test('pré-visualização ao vivo: a janela de execução se atualiza com o formulário e o script; desligada, não', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.setField('id', 'btnOk')
  await s.setField('text', 'Um')

  const live = s.page.getByTestId('toggle-live')
  await expect(live).toHaveAttribute('aria-pressed', 'false')
  await live.click()
  await expect(live).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await readJson(join(s.profile, 'settings.json'))).livePreview).toBe(true)

  const rp = await s.runForm()
  const botao = run(rp, 'btnOk').locator('button')
  await expect(botao).toHaveText('Um')

  // Mudança no formulário: a mesma janela passa a mostrar o texto novo (sem abrir outra).
  await s.node('btnOk').click()
  await s.setField('text', 'Dois')
  await expect(botao).toHaveText('Dois', { timeout: 10_000 })
  expect(s.app.windows()).toHaveLength(2)
  await expect(s.page.locator('.console-line', { hasText: 'Executando' })).toHaveCount(1) // não reabre a cada mudança

  // Mudança no script, ainda não salvo.
  await s.openCode()
  await s.focusEditor()
  await s.page.keyboard.press('Control+a')
  await s.pasteInEditor('@form.on_load\ndef a():\n    form.btnOk.text = "do script"')
  await expect(botao).toHaveText('do script', { timeout: 10_000 })

  // Desligado, as mudanças não chegam à janela.
  await live.click()
  await expect(live).toHaveAttribute('aria-pressed', 'false')
  await s.page.getByTestId('tab-design-Main').click()
  await s.node('btnOk').click()
  await s.setField('text', 'Tres')
  await s.page.waitForTimeout(2000)
  await expect(botao).toHaveText('do script')

  // Fechar a janela e continuar editando não a reabre.
  await live.click() // liga de novo
  await rp.close()
  await expect(s.page.getByRole('button', { name: /Parar/ })).toBeDisabled()
  await s.setField('text', 'Quatro')
  await s.page.waitForTimeout(2000)
  expect(s.app.windows()).toHaveLength(1)
})
