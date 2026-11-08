import { expect, _electron as electron, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const MAIN = resolve(__dirname, '../../out/main/index.js')

export type Point = { x: number; y: number }

/**
 * Abre o app com um perfil (localStorage, preferências) novo e descartável: cada teste começa do
 * zero e nada vaza entre testes nem para o perfil do app de verdade.
 */
export async function launchApp(): Promise<{ app: ElectronApplication; cleanup: () => Promise<void> }> {
  const profile = await mkdtemp(join(tmpdir(), 'vform-profile-'))
  const app = await electron.launch({ args: [MAIN, `--user-data-dir=${profile}`] })
  return {
    app,
    cleanup: async () => {
      await app.close()
      await rm(profile, { recursive: true, force: true })
    }
  }
}

/** App Electron com um projeto novo aberto, mais os gestos de mouse usados pelos testes. */
export class Studio {
  app!: ElectronApplication
  private cleanupApp!: () => Promise<void>
  page!: Page
  dir = ''
  surface!: Locator

  async start(): Promise<void> {
    this.dir = await mkdtemp(join(tmpdir(), 'vform-e2e-'))
    const launched = await launchApp()
    this.app = launched.app
    this.cleanupApp = launched.cleanup
    this.page = await this.app.firstWindow()
    await this.page.waitForSelector('.welcome')
    await this.stubDialog(this.dir)
    await this.page.getByRole('button', { name: 'Novo projeto' }).click()
    this.surface = this.page.getByTestId('surface')
    await expect(this.surface).toBeVisible()
    await this.settled(this.surface)
  }

  async stop(): Promise<void> {
    await this.cleanupApp()
    await rm(this.dir, { recursive: true, force: true })
  }

  /** Troca o diálogo nativo de seleção por uma resposta fixa. */
  async stubDialog(path: string): Promise<void> {
    await this.app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
    }, path)
  }

  node = (id: string): Locator => this.page.locator(`[data-node-id="${id}"]`)
  /** Filho direto de um container (ficam dentro da camada `.children-layer`). */
  childOf = (parent: string, child: string): Locator =>
    this.page.locator(`[data-node-id="${parent}"] > .children-layer > [data-node-id="${child}"]`)
  tree = (id: string): Locator => this.page.getByTestId(`tree-${id}`)
  palette = (type: string): Locator => this.page.locator('.palette-item', { hasText: new RegExp(`^${type}$`) })
  prop = (key: string): Locator => this.page.getByTestId(`prop-${key}`)

  async geometry(id: string): Promise<{ x: number; y: number; w: number; h: number }> {
    return this.node(id).evaluate((el) => {
      const e = el as HTMLElement
      return { x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight }
    })
  }

  static async center(l: Locator): Promise<Point> {
    const b = (await l.boundingBox())!
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }

  /** Arrasta com o mouse de um ponto a outro, passo a passo (para disparar os movimentos). */
  async mouseDrag(from: Point, to: Point): Promise<void> {
    await this.page.mouse.move(from.x, from.y)
    await this.page.mouse.down()
    await this.page.mouse.move(to.x, to.y, { steps: 8 })
    await this.page.mouse.up()
  }

  /**
   * Arrasta um componente da paleta e solta no alvo (posição relativa ao canto do alvo).
   * Faz o gesto em passos e espera o `dragend`: soltar antes de o Chromium entregar um `dragover`
   * cancela o arraste, e começar outro gesto antes do `dragend` o corrompe (a pessoa nunca age em
   * poucos ms, mas o teste sim).
   */
  async dropFrom(type: string, target: Locator, pos: Point): Promise<void> {
    const { page } = this
    const src = (await this.palette(type).boundingBox())!
    const dst = (await target.boundingBox())!
    const to = { x: dst.x + pos.x, y: dst.y + pos.y }
    const from = { x: src.x + src.width / 2, y: src.y + src.height / 2 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 12, from.y + 8, { steps: 3 }) // inicia o arraste
    await page.mouse.move(to.x - 6, to.y - 6, { steps: 8 })
    await page.mouse.move(to.x, to.y, { steps: 3 })
    await page.waitForTimeout(50)
    const ended = page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          window.addEventListener('dragend', () => resolve(), { once: true, capture: true })
          setTimeout(resolve, 1500)
        })
    )
    await page.mouse.up()
    await ended
  }

  /** Espera o layout parar de mudar (os painéis se ajustam logo após a partida a frio). */
  async settled(l: Locator): Promise<void> {
    let prev = ''
    await expect
      .poll(
        async () => {
          const now = JSON.stringify(await l.boundingBox())
          const same = now === prev
          prev = now
          return same
        },
        { intervals: [150, 150, 150, 150], timeout: 10_000 }
      )
      .toBe(true)
  }

  /** Confirma um campo de texto do painel de propriedades (Enter) escrevendo o valor. */
  async setField(key: string, value: string): Promise<void> {
    const field = this.prop(key)
    await field.fill(value)
    await field.press('Enter')
  }
}
