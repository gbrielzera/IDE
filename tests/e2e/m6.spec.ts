import { test, expect, type Page } from '@playwright/test'
import { Studio } from './helpers'

const s = new Studio()

test.afterEach(async () => {
  await s.stop()
})

const run = (page: Page, id: string) => page.locator(`[data-run-id="${id}"]`)

test.describe('janela do formulário movível', () => {
  const frame = () => s.page.locator('.form-frame').boundingBox().then((b) => b!)
  const titlebar = () => s.page.getByTestId('form-titlebar')

  test('arrasta pela barra de título, mantém a posição entre abas e volta ao centro com duplo clique', async () => {
    await s.start()
    const home = await frame()
    const bar = await Studio.center(titlebar())

    await s.mouseDrag(bar, { x: bar.x + 80, y: bar.y + 50 })
    const moved = await frame()
    expect(moved.x - home.x).toBeCloseTo(80, 0)
    expect(moved.y - home.y).toBeCloseTo(50, 0)
    await expect(s.page.locator('.statusbar')).not.toContainText('não salvo') // posição na tela não é alteração do projeto

    // A posição sobrevive à troca de aba.
    await s.openCode()
    await s.page.getByTestId('tab-design-Main').click()
    const back = await frame()
    expect([back.x, back.y]).toEqual([moved.x, moved.y])

    // Redimensionar pela borda direita não faz a janela "andar": a borda esquerda fica onde está.
    const edge = await Studio.center(s.page.getByTestId('grip-e'))
    await s.mouseDrag(edge, { x: edge.x + 40, y: edge.y })
    const wider = await frame()
    expect(wider.x).toBe(moved.x)
    expect(wider.width - moved.width).toBe(40)

    // Duplo clique na barra de título: volta a centralizar.
    await titlebar().dblclick()
    const centered = await frame()
    expect(Math.abs(centered.x - home.x)).toBeLessThan(21) // a largura mudou (+40): o centro mudou junto
    expect(centered.y).toBeCloseTo(home.y, 0)
    expect(centered.x).toBeLessThan(moved.x)
  })

  test('não deixa a janela sair da área de trabalho', async () => {
    await s.start()
    const area = (await s.page.locator('.canvas-scroll').boundingBox())!
    const bar = await Studio.center(titlebar())
    await s.mouseDrag(bar, { x: bar.x + 3000 > 1400 ? 1400 : bar.x + 3000, y: bar.y + 600 })
    const far = await frame()
    expect(far.x).toBeLessThan(area.x + area.width - 60) // sempre sobram pelo menos 80px à vista
    expect(far.y).toBeLessThan(area.y + area.height - 40)
    await s.mouseDrag(await Studio.center(titlebar()), { x: 5, y: 5 })
    const near = await frame()
    expect(near.x).toBeGreaterThanOrEqual(area.x)
    expect(near.y).toBeGreaterThanOrEqual(area.y)
  })

  test('arrastar um componente continua funcionando com a janela deslocada', async () => {
    await s.start()
    const bar = await Studio.center(titlebar())
    await s.mouseDrag(bar, { x: bar.x - 60, y: bar.y + 30 })
    await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
    expect(await s.geometry('button1')).toMatchObject({ x: 104, y: 64 })
    await s.mouseDrag(await Studio.center(s.node('button1')), { x: (await s.surface.boundingBox())!.x + 250, y: (await s.surface.boundingBox())!.y + 200 })
    expect((await s.geometry('button1')).x).toBeGreaterThan(104)
  })
})

test('abrir o código pela 1ª vez é rápido (o editor é carregado em segundo plano)', async () => {
  await s.start()
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.setField('id', 'btnOk')
  await s.page.waitForTimeout(2500) // o carregamento antecipado já terminou
  const t0 = Date.now()
  await s.node('btnOk').dblclick()
  await s.page.locator('.monaco-editor .view-line').first().waitFor({ timeout: 2000 })
  expect(Date.now() - t0).toBeLessThan(1500) // antes: ~0,9 s (compilado) e ~10 s (npm run dev)
  expect(await s.editorText()).toContain('def btnOk_click():')
})

test.describe('pré-visualização ao vivo ao lado da IDE', () => {
  // As janelas precisam aparecer na tela de verdade para checar o encaixe: só rodam com VFORM_SHOW_WINDOWS=1
  // (os testes normais ficam fora da tela para não atrapalhar quem está usando o computador).
  test.skip(!process.env.VFORM_SHOW_WINDOWS, 'janelas visíveis: rode com VFORM_SHOW_WINDOWS=1')
  interface Geo {
    ide: { x: number; y: number; width: number; height: number }
    run: { x: number; y: number; width: number; height: number } | null
    area: { x: number; y: number; width: number; height: number }
  }
  const geo = (): Promise<Geo> =>
    s.app.evaluate(({ BrowserWindow, screen }) => {
      const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && !w.webContents.isDestroyed())
      const run = wins.find((w) => w.webContents.getURL().endsWith('#run'))
      const ide = wins.find((w) => w !== run)!
      return { ide: ide.getBounds(), run: run ? run.getBounds() : null, area: screen.getDisplayMatching(ide.getBounds()).workArea }
    })

  test('ligar o "Ao vivo" abre a prévia encaixada ao lado; fechar devolve o tamanho da IDE', async () => {
    await s.start()
    await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
    await s.setField('id', 'btnOk')
    await s.setField('text', 'Um')
    const original = { x: 40, y: 40, width: 1200, height: 800 }
    await s.app.evaluate(({ BrowserWindow }, b) => BrowserWindow.getAllWindows()[0].setBounds(b), original)
    const before = await geo()
    test.skip(before.area.width < 1300, 'tela pequena demais para encaixar duas janelas')

    const [rp] = await Promise.all([s.app.waitForEvent('window'), s.page.getByTestId('toggle-live').click()])
    await rp.waitForSelector('.run-root')
    await expect(run(rp, 'btnOk').locator('button')).toHaveText('Um')

    const docked = await geo()
    const tol = 16 // bordas invisíveis das janelas do Windows
    expect(docked.run).not.toBeNull()
    expect(docked.ide.width + docked.run!.width).toBeLessThanOrEqual(docked.area.width + tol) // dividem a tela
    expect(docked.run!.x).toBeGreaterThanOrEqual(docked.ide.x + docked.ide.width - tol) // lado a lado, sem sobrepor
    expect(docked.run!.x + docked.run!.width).toBeLessThanOrEqual(docked.area.x + docked.area.width + tol)
    expect(Math.abs(docked.ide.x - docked.area.x)).toBeLessThanOrEqual(tol)
    expect(docked.ide.height).toBeGreaterThanOrEqual(docked.area.height - tol)

    // Atualiza ao vivo na janela encaixada.
    await s.node('btnOk').click()
    await s.setField('text', 'Dois')
    await expect(run(rp, 'btnOk').locator('button')).toHaveText('Dois', { timeout: 10_000 })
    expect((await geo()).run!.x).toBe(docked.run!.x) // a janela ficou onde estava

    // Fechou a prévia: a IDE volta ao tamanho que tinha.
    await rp.close()
    await expect
      .poll(async () => {
        const b = (await geo()).ide
        return [b.x, b.y, b.width, b.height].map((n) => Math.abs(n)).join()
      }, { timeout: 5000 })
      .toBe([original.x, original.y, original.width, original.height].join())
  })

  test('com o "Ao vivo" ligado, F5 também abre a prévia ao lado, sem empilhar janelas', async () => {
    await s.start()
    await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
    const before = await geo()
    test.skip(before.area.width < 1300, 'tela pequena demais para encaixar duas janelas')
    const [first] = await Promise.all([s.app.waitForEvent('window'), s.page.getByTestId('toggle-live').click()])
    await first.waitForSelector('.run-root')

    const [second] = await Promise.all([s.app.waitForEvent('window'), s.page.keyboard.press('F5')])
    await second.waitForSelector('.run-root')
    await expect.poll(() => first.isClosed()).toBe(true)
    expect(s.app.windows()).toHaveLength(2)
    const g = await geo()
    expect(g.run!.x).toBeGreaterThanOrEqual(g.ide.x + g.ide.width - 16)

    await second.close()
    await expect.poll(async () => (await geo()).ide.width, { timeout: 5000 }).toBeGreaterThanOrEqual(before.ide.width - 2)
  })
})

test.describe('renomear um ID atualiza o código', () => {
  async function criarBotaoComHandler(): Promise<void> {
    await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
    await s.setField('id', 'btnOk')
    await s.dropFrom('Label', s.surface, { x: 302, y: 62 })
    await s.setField('id', 'lblInfo')
    await s.node('btnOk').dblclick() // cria @form.btnOk.on_click
    await s.waitEditorFocus()
    await s.page.keyboard.press('Shift+Home')
    await s.pasteInEditor('form.lblInfo.text = f"Clicou em {form.btnOk.text}"')
    await s.page.getByTestId('tab-design-Main').click()
    await s.node('btnOk').click()
  }

  test('o script acompanha a mudança, o aviso não aparece, e desfazer/refazer também', async () => {
    await s.start()
    await criarBotaoComHandler()
    await s.setField('id', 'btnSalvar')
    await expect(s.page.locator('.console-line', { hasText: '"btnOk" → "btnSalvar"' })).toBeVisible()
    await expect(s.page.locator('.console-line', { hasText: '2 referências atualizadas em Main.py' })).toBeVisible()

    await s.openCode()
    let code = await s.editorText()
    expect(code).toContain('@form.btnSalvar.on_click')
    expect(code).toContain('{form.btnSalvar.text}') // dentro da f-string também
    // Só o texto de exemplo (comentário do modelo) ainda cita btnOk, e comentários não são alterados.
    expect(code.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n')).not.toMatch(/form\.btnOk\b/)
    expect(code).toContain('def btnOk_click():') // o nome da função não é referência a ID: fica
    await expect(s.page.locator('.monaco-editor .squiggly-warning')).toHaveCount(0)

    await s.page.getByTestId('tab-design-Main').click()
    await s.page.keyboard.press('Control+z')
    await s.openCode()
    code = await s.editorText()
    expect(code).toContain('@form.btnOk.on_click')
    expect(code).toContain('{form.btnOk.text}')

    await s.page.getByTestId('tab-design-Main').click()
    await s.page.keyboard.press('Control+y')
    await s.openCode()
    expect(await s.editorText()).toContain('@form.btnSalvar.on_click')
  })

  test('o programa continua funcionando depois de renomear (o botão ainda responde)', async () => {
    await s.start()
    await criarBotaoComHandler()
    await s.setField('id', 'btnSalvar')
    const rp = await s.runForm()
    await run(rp, 'btnSalvar').locator('button').click()
    await expect(run(rp, 'lblInfo').locator('.r-label')).toHaveText('Clicou em Button')
    await expect(s.page.locator('.console-line.error')).toHaveCount(0)
  })
})
