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
export async function launchApp(
  env: Record<string, string> = {},
  /** Perfil já existente (para reabrir o app "do mesmo usuário"); por padrão cria um novo e o apaga ao fechar. */
  existingProfile?: string
): Promise<{ app: ElectronApplication; profile: string; cleanup: () => Promise<void> }> {
  const profile = existingProfile ?? (await mkdtemp(join(tmpdir(), 'vform-profile-')))
  const app = await electron.launch({ args: [MAIN, `--user-data-dir=${profile}`], env: { ...process.env, ...env } as Record<string, string> })
  return {
    app,
    profile,
    cleanup: async () => {
      await app.close()
      if (!existingProfile) await rm(profile, { recursive: true, force: true })
    }
  }
}

/** App Electron com um projeto novo aberto, mais os gestos de mouse usados pelos testes. */
export class Studio {
  app!: ElectronApplication
  private cleanupApp!: () => Promise<void>
  page!: Page
  dir = ''
  profile = ''
  surface!: Locator

  async start(env: Record<string, string> = {}, existingProfile?: string): Promise<void> {
    this.dir = await mkdtemp(join(tmpdir(), 'vform-e2e-'))
    const launched = await launchApp(env, existingProfile)
    this.profile = launched.profile
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

  /** Abre a aba de código do formulário e espera o Monaco aparecer. */
  async openCode(form = 'Main'): Promise<void> {
    await this.page.getByTestId(`tab-code-${form}`).click()
    await this.page.locator('.monaco-editor .view-line').first().waitFor() // linhas já desenhadas
  }

  /**
   * Clica no editor e espera ele ficar com o foco. O Monaco é carregado sob demanda: teclas digitadas antes
   * disso não chegam nele, então todo teste que digita passa por aqui (ou por `waitEditorFocus`).
   */
  async focusEditor(): Promise<void> {
    await this.page.locator('.monaco-editor .view-lines').first().click()
    await this.waitEditorFocus()
  }

  /** Espera o foco no editor (o duplo clique já o foca sozinho ao levar o cursor ao handler). */
  async waitEditorFocus(): Promise<void> {
    await this.page.locator('.monaco-editor.focused').first().waitFor()
  }

  /** Texto visível do editor de código (o Monaco só desenha as linhas na tela; scripts curtos cabem). */
  async editorText(): Promise<string> {
    const text = await this.page.locator('.monaco-editor .view-lines').first().innerText()
    return text.replace(/ /g, ' ')
  }

  /** Rótulos (ID, tipo) das sugestões que o Monaco está mostrando agora. */
  suggestionLabels(): Promise<string[]> {
    return this.page
      .locator('.suggest-widget .monaco-list-row')
      .evaluateAll((rows) => rows.map((r) => r.getAttribute('aria-label') ?? ''))
  }

  /**
   * Insere texto de uma vez, como uma colagem. Para trechos de várias linhas: digitar `Enter` com a lista de
   * sugestões aberta aceita a sugestão em vez de quebrar a linha, e o Monaco também fecha aspas/parênteses.
   */
  async pasteInEditor(text: string): Promise<void> {
    await this.page.keyboard.insertText(text)
  }

  /** Digita no editor como uma pessoa (com as sugestões e os fechamentos automáticos do Monaco). */
  async typeInEditor(text: string): Promise<void> {
    await this.page.keyboard.type(text, { delay: 15 })
  }

  /** Executa o formulário (F5) e devolve a janela de execução, já com o formulário renderizado. */
  async runForm(): Promise<Page> {
    const [runPage] = await Promise.all([this.app.waitForEvent('window'), this.page.keyboard.press('F5')])
    await runPage.waitForSelector('.run-root')
    return runPage
  }

  /** Texto de todas as linhas do console da IDE. */
  consoleLines(): Promise<string[]> {
    return this.page.locator('.console-line').allTextContents()
  }

  /** Confirma um campo de texto do painel de propriedades (Enter) escrevendo o valor. */
  async setField(key: string, value: string): Promise<void> {
    const field = this.prop(key)
    await field.fill(value)
    await field.press('Enter')
  }
}
