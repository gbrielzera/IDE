import { test, expect } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Studio } from './helpers'

const s = new Studio()

test.afterEach(async () => {
  await s.stop()
})

const mainPy = (): Promise<string> => readFile(join(s.dir, 'Main.py'), 'utf8')
const run = (page: import('@playwright/test').Page, id: string) => page.locator(`[data-run-id="${id}"]`)

async function buildBasico(): Promise<void> {
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.setField('id', 'btnOk')
  await s.setField('text', 'Clique')
  await s.dropFrom('Label', s.surface, { x: 302, y: 62 })
  await s.setField('id', 'lblInfo')
}

test('a aba de código abre o Monaco com o script, sem erro de segurança, e o texto sobrevive à troca de aba', async () => {
  await s.start()
  const problems: string[] = []
  s.page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
  s.page.on('pageerror', (e) => problems.push(String(e)))

  await expect(s.page.getByTestId('tab-design-Main')).toHaveText('Main.form.json')
  await expect(s.page.getByTestId('tab-code-Main')).toHaveText('Main.py')
  await s.openCode()
  await expect(s.page.getByTestId('tab-code-Main')).toHaveClass(/active/)
  expect(await s.editorText()).toContain('@form.on_load')
  await expect(s.page.getByTestId('code-editor').locator('.monaco-editor.vs')).toBeVisible() // tema claro por padrão

  await s.focusEditor()
  await s.page.keyboard.press('Control+End')
  await s.typeInEditor('# anotacao')
  await expect(s.page.getByTestId('tab-code-Main')).toContainText('●') // alterado e não salvo
  await s.page.getByTestId('tab-design-Main').click()
  await expect(s.surface).toBeVisible()
  await s.openCode()
  expect(await s.editorText()).toContain('# anotacao') // o texto e o histórico ficam entre as abas

  // Desfazer do próprio Monaco volta atrás (e ainda é o editor, não o desfazer do formulário).
  await s.focusEditor()
  await s.page.keyboard.press('Control+z')
  await expect.poll(() => s.editorText()).not.toContain('# anotacao')
  expect(problems).toEqual([])
})

test('autocompletar: form. lista os IDs e form.<id>. os membros do tipo', async () => {
  await s.start()
  await buildBasico()
  await s.openCode()
  await s.focusEditor()
  await s.page.keyboard.press('Control+End')
  await s.page.keyboard.press('Enter')
  await s.typeInEditor('form.')

  await expect(s.page.locator('.suggest-widget')).toBeVisible()
  await expect.poll(() => s.suggestionLabels()).toEqual(
    expect.arrayContaining([expect.stringContaining('btnOk'), expect.stringContaining('lblInfo'), expect.stringContaining('on_load')])
  )
  await expect(s.page.locator('.suggest-widget')).toContainText('Button') // o tipo aparece como detalhe

  // A lista de membros é longa (e virtualizada): digitar filtra.
  await s.page.keyboard.press('Escape')
  await s.typeInEditor('btnOk.on_')
  await expect.poll(() => s.suggestionLabels()).toEqual(expect.arrayContaining([expect.stringContaining('on_click')]))
  await s.page.keyboard.press('Backspace')
  await s.page.keyboard.press('Backspace')
  await s.page.keyboard.press('Backspace')
  await s.typeInEditor('te')
  await expect.poll(() => s.suggestionLabels()).toEqual(expect.arrayContaining([expect.stringContaining('text')]))
  await s.page.keyboard.press('Backspace')
  await s.page.keyboard.press('Backspace')
  await s.typeInEditor('font')
  await expect.poll(() => s.suggestionLabels()).toEqual(expect.arrayContaining([expect.stringContaining('font_size')]))
  await s.page.keyboard.press('Backspace')
  await s.page.keyboard.press('Backspace')
  await s.page.keyboard.press('Backspace')
  await s.page.keyboard.press('Backspace')
  await s.typeInEditor('add_')
  await expect(s.page.locator('.suggest-widget')).toBeHidden() // Button não tem add_item
  await s.page.keyboard.press('Escape')

  await s.typeInEditor('x\napp.show')
  await expect.poll(() => s.suggestionLabels()).toEqual(expect.arrayContaining([expect.stringContaining('show_message')]))
})

test('IDs e propriedades inexistentes ganham aviso na linha; corrigir remove o aviso', async () => {
  await s.start()
  await buildBasico()
  await s.openCode()
  await s.focusEditor()
  await s.page.keyboard.press('Control+a')
  await s.pasteInEditor('form.btnOkk.text = "x"') // colar: sem lista de sugestões nem fechamento automático
  await expect(s.page.locator('.monaco-editor .squiggly-warning').first()).toBeVisible()

  await s.page.keyboard.press('Control+a')
  await s.pasteInEditor('form.btnOk.text = "x"')
  await expect(s.page.locator('.monaco-editor .squiggly-warning')).toHaveCount(0)

  // Renomear o componente na IDE atualiza o código que o usa: não sobra aviso nenhum.
  await s.page.getByTestId('tab-design-Main').click()
  await s.node('btnOk').click()
  await s.setField('id', 'btnSalvar')
  await s.openCode()
  expect(await s.editorText()).toContain('form.btnSalvar.text')
  await expect(s.page.locator('.monaco-editor .squiggly-warning')).toHaveCount(0)

  // Já um ID que realmente não existe (apagado no formulário) continua sendo avisado.
  await s.focusEditor()
  await s.page.keyboard.press('Control+a')
  await s.pasteInEditor('form.btnApagado.text = "x"')
  await expect(s.page.locator('.monaco-editor .squiggly-warning').first()).toBeVisible()
})

test('duplo clique no componente cria o handler, abre o código com o cursor no corpo e salva', async () => {
  await s.start()
  await buildBasico()
  await s.node('btnOk').dblclick()

  await expect(s.page.getByTestId('tab-code-Main')).toHaveClass(/active/)
  await expect(s.page.locator('.monaco-editor').first()).toBeVisible()
  expect(await s.editorText()).toContain('@form.btnOk.on_click')
  expect(await s.editorText()).toContain('def btnOk_click():')
  await s.waitEditorFocus()

  // O cursor já está na linha do `pass`: Shift+Home seleciona só o `pass` e a digitação o substitui.
  await s.page.keyboard.press('Shift+Home')
  await s.typeInEditor('print("oi")')
  await s.page.keyboard.press('Control+s')
  await expect(s.page.locator('.console-line', { hasText: 'Projeto salvo' })).toBeVisible()
  await expect(s.page.getByTestId('tab-code-Main')).not.toContainText('●')
  await expect.poll(mainPy).toContain('@form.btnOk.on_click\ndef btnOk_click():\n    print("oi")')
  expect(await mainPy()).toContain('@form.on_load') // o resto do script foi preservado

  // Duplo clique de novo (ou no formulário vazio) só leva ao que já existe.
  await s.page.getByTestId('tab-design-Main').click()
  await s.node('btnOk').dblclick()
  await expect(s.page.getByTestId('tab-code-Main')).toHaveClass(/active/)
  await s.page.getByTestId('tab-design-Main').click()
  const box = (await s.surface.boundingBox())!
  await s.page.mouse.dblclick(box.x + box.width - 30, box.y + box.height - 30)
  await expect(s.page.getByTestId('tab-code-Main')).toHaveClass(/active/)
  await s.page.keyboard.press('Control+s')
  const again = await mainPy() // não foi alterado depois: o arquivo é o mesmo de antes
  // (o comentário do modelo de script também cita `@form.btnOk.on_click`: só conta o decorador de verdade)
  expect(again.match(/^@form\.btnOk\.on_click/gm)).toHaveLength(1)
  expect(again.match(/^@form\.on_load/gm)).toHaveLength(1)
})

test('duplo clique num componente dentro de um Panel abre o handler dele, não o do Panel', async () => {
  await s.start()
  await s.dropFrom('Panel', s.surface, { x: 202, y: 102 })
  await s.dropFrom('TextField', s.node('panel1'), { x: 22, y: 22 })
  await s.node('textField1').dblclick()
  await expect(s.page.getByTestId('tab-code-Main')).toHaveClass(/active/)
  await s.page.keyboard.press('Control+s')
  await expect.poll(mainPy).toContain('@form.textField1.on_change\ndef textField1_change(ev):')
  expect(await mainPy()).not.toContain('panel1')
})

test('executar usa o texto ainda não salvo do editor; o erro marca a linha e leva ao código', async () => {
  await s.start()
  await buildBasico()
  await s.node('btnOk').dblclick()
  await s.waitEditorFocus()
  await s.page.keyboard.press('Shift+Home')
  await s.typeInEditor('form.lblInfo.text = "clicou"')
  await s.page.keyboard.press('Escape')
  expect(await mainPy()).not.toContain('clicou') // nada salvo em disco

  const rp = await s.runForm() // F5 com o foco dentro do editor
  await expect(s.page.locator('.console-line', { hasText: 'do editor, ainda não salvo' })).toBeVisible()
  await run(rp, 'btnOk').locator('button').click()
  await expect(run(rp, 'lblInfo').locator('.r-label')).toHaveText('clicou')
  await rp.close()

  // Agora um erro no handler: a linha fica marcada no editor e o console leva até ela.
  await s.focusEditor()
  await s.page.keyboard.press('Control+a')
  await s.pasteInEditor('@form.btnOk.on_click\ndef f():\n    1/0')
  await s.page.keyboard.press('Escape')
  const rp2 = await s.runForm()
  await run(rp2, 'btnOk').locator('button').click()
  const erro = s.page.locator('.console-line.error.clickable', { hasText: 'ZeroDivisionError' })
  await expect(erro).toContainText('linha 3')
  await expect(s.page.locator('.monaco-editor .squiggly-error').first()).toBeVisible()
  await rp2.close()

  await s.page.getByTestId('tab-design-Main').click()
  await expect(s.surface).toBeVisible()
  await erro.click()
  await expect(s.page.getByTestId('tab-code-Main')).toHaveClass(/active/)
  await expect(s.page.locator('.monaco-editor .squiggly-error').first()).toBeVisible()

  // Executar de novo limpa as marcas da execução anterior.
  await s.page.keyboard.press('Control+a')
  await s.pasteInEditor('@form.btnOk.on_click\ndef f():\n    form.lblInfo.text = "ok"')
  await s.page.keyboard.press('Escape')
  const rp3 = await s.runForm()
  await expect(s.page.locator('.monaco-editor .squiggly-error')).toHaveCount(0)
  await rp3.close()
})

test('salvar não desfaz a edição externa de um script que não foi alterado na IDE', async () => {
  await s.start()
  await writeFile(join(s.dir, 'Main.py'), '# editado em outro programa\n', 'utf8')
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 }) // só o layout mudou na IDE
  await s.page.keyboard.press('Control+s')
  await expect(s.page.locator('.console-line', { hasText: 'Projeto salvo' })).toBeVisible()
  expect(await mainPy()).toBe('# editado em outro programa\n')
  const form = JSON.parse(await readFile(join(s.dir, 'Main.form.json'), 'utf8'))
  expect(form.children).toHaveLength(1)

  // Já depois de editar o script na IDE, ele é o que vale e vai para o disco.
  await s.openCode()
  await s.focusEditor()
  await s.page.keyboard.press('Control+End')
  await s.typeInEditor('x = 1')
  await s.page.keyboard.press('Control+s')
  await expect.poll(mainPy).toContain('x = 1')
})

test('reabrir o projeto recarrega o script do disco no editor', async () => {
  await s.start()
  await s.openCode()
  await s.focusEditor()
  await s.page.keyboard.press('Control+End')
  await s.typeInEditor('# primeira')
  await s.page.keyboard.press('Control+s')
  await expect.poll(mainPy).toContain('# primeira')

  await writeFile(join(s.dir, 'Main.py'), '# versao do disco\n', 'utf8')
  await s.page.getByRole('button', { name: 'Abrir', exact: true }).click()
  await expect(s.surface).toBeVisible() // a visão volta ao formulário
  await s.openCode()
  expect(await s.editorText()).toContain('# versao do disco')
  expect(await s.editorText()).not.toContain('# primeira')
  await expect(s.page.getByTestId('tab-code-Main')).not.toContainText('●')
})

test('o editor acompanha o tema escuro', async () => {
  await s.start()
  await s.openCode()
  await expect(s.page.getByTestId('code-editor').locator('.monaco-editor.vs')).toBeVisible()
  await s.page.getByRole('button', { name: 'Exibir' }).click()
  await s.page.getByRole('menuitem', { name: /tema/ }).click()
  await expect(s.page.getByTestId('code-editor').locator('.monaco-editor.vs-dark')).toBeVisible()
})

test('se o editor não carregar, a IDE mostra o erro e continua viva (nunca uma tela em branco)', async () => {
  await s.start({}, undefined, true) // com o pedaço do Monaco bloqueado desde o início
  await s.dropFrom('Button', s.surface, { x: 102, y: 62 })
  await s.setField('id', 'btnOk')
  await s.node('btnOk').dblclick()

  const erro = s.page.getByTestId('code-error')
  await expect(erro).toBeVisible()
  await expect(erro).toContainText('Não foi possível abrir o editor de código')
  await expect(erro).toContainText('Main.py') // diz onde o script está
  await expect(s.page.locator('.console-line.error', { hasText: 'Não foi possível abrir o editor' })).toBeVisible()
  // O resto da IDE segue funcionando: menus, abas e o próprio formulário.
  await expect(s.page.getByTestId('tab-design-Main')).toBeVisible()
  await expect(s.page.getByRole('button', { name: 'Arquivo' })).toBeVisible()

  await s.page.getByRole('button', { name: 'Voltar ao formulário' }).click()
  await expect(s.surface).toBeVisible()
  await expect(s.node('btnOk')).toBeVisible()
  await expect(s.page.getByTestId('prop-id')).toBeVisible()
})
