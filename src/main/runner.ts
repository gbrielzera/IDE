import { app, BrowserWindow, dialog, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent, type Rectangle } from 'electron'
import { existsSync, promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type { FormDocument } from '@shared/project'
import { NO_PREVIEW_WINDOW, type RunConsoleMessage, type RunEnded, type RunInit, type RunPayload, type RunStartResult, type RunToPython } from '@shared/run'
import { getProjectDir, insideProject } from './projectFs'
import { findPython, PythonHost, type PyMessage, type PythonCommand } from './pythonHost'

interface Run {
  id: number
  ide: BrowserWindow
  win: BrowserWindow
  /** id do webContents da janela de execução, guardado porque a janela destruída não pode ser consultada. */
  winContentsId: number
  host: PythonHost
  init: RunInit
  scriptPath: string
  script: string
  loaded: boolean
  ended: boolean
  /** Quem pediu o fim: a IDE (Parar) ou quem fechou a janela de execução. */
  stopping: boolean
}

/** Execuções por webContents da janela de execução, e por janela da IDE (uma de cada vez). */
const byRunWindow = new Map<number, Run>()
const byIde = new Map<number, Run>()
let nextRunId = 1

function runtimeScript(): string | null {
  const candidates = [
    join(__dirname, '..', '..', 'python', 'vform_runtime', 'main.py'), // dev e build (out/main → raiz)
    join(process.resourcesPath ?? '', 'python', 'vform_runtime', 'main.py') // empacotado
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

function parsePayload(raw: unknown): RunPayload | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Partial<RunPayload>
  const doc = p.doc as Partial<FormDocument> | undefined
  if (typeof p.formName !== 'string' || typeof p.scriptPath !== 'string') return null
  if (p.script !== undefined && typeof p.script !== 'string') return null
  if (p.reuse !== undefined && typeof p.reuse !== 'boolean') return null
  if (p.dock !== undefined && typeof p.dock !== 'boolean') return null
  if (!doc || typeof doc.width !== 'number' || typeof doc.height !== 'number' || !Array.isArray(doc.children)) return null
  if (typeof p.components !== 'object' || p.components === null) return null
  return p as RunPayload
}

function toIde(run: Run, channel: string, payload: unknown): void {
  if (!run.ide.isDestroyed()) run.ide.webContents.send(channel, payload)
}

function ideConsole(run: Run, msg: RunConsoleMessage): void {
  toIde(run, 'run:console', msg)
}

/** Tamanho/posição da IDE antes de encaixar a prévia ao lado, para devolvê-la ao fechar a prévia. */
interface DockState {
  bounds: Rectangle
  maximized: boolean
}
const dockStates = new Map<number, DockState>()

/** A IDE precisa de pelo menos isto de largura (é o `minWidth` da janela); o resto da tela vai para a prévia. */
const MIN_IDE_WIDTH = 960
const MIN_PREVIEW_WIDTH = 320

/**
 * Encaixa a janela de execução na direita da tela e reduz a IDE para ocupar o resto (como o Live Preview do
 * VS Code abre a prévia ao lado do código). Sem espaço para as duas, a prévia só abre normalmente.
 */
function dockBeside(ide: BrowserWindow, win: BrowserWindow, contentWidth: number, contentHeight: number): boolean {
  const area = screen.getDisplayMatching(ide.getBounds()).workArea
  const [outerW, outerH] = win.getSize()
  const [innerW, innerH] = win.getContentSize()
  let width = Math.round(contentWidth) + (outerW - innerW) // a moldura do sistema também ocupa espaço
  const height = Math.min(Math.round(contentHeight) + (outerH - innerH), area.height)
  width = Math.min(width, area.width - MIN_IDE_WIDTH, Math.round(area.width * 0.6))
  if (width < MIN_PREVIEW_WIDTH) return false // a tela é pequena demais: abre normalmente

  if (!dockStates.has(ide.id)) dockStates.set(ide.id, { bounds: ide.getBounds(), maximized: ide.isMaximized() })
  if (ide.isMaximized()) ide.unmaximize()
  ide.setBounds({ x: area.x, y: area.y, width: area.width - width, height: area.height })
  win.setBounds({ x: area.x + area.width - width, y: area.y, width, height })
  return true
}

/** Devolve a IDE ao tamanho anterior, a menos que outra prévia tenha acabado de assumir o lugar da que fechou. */
function scheduleDockRestore(ide: BrowserWindow): void {
  const state = dockStates.get(ide.id)
  if (!state) return
  setTimeout(() => {
    if (byIde.has(ide.id)) return // outra execução (F5 de novo) já está em andamento: continua encaixada
    dockStates.delete(ide.id)
    if (ide.isDestroyed()) return
    ide.setBounds(state.bounds)
    if (state.maximized) ide.maximize()
  }, 250)
}

function endRun(run: Run, reason: RunEnded['reason'], code: number | null = null): void {
  if (run.ended) return
  run.ended = true
  byRunWindow.delete(run.winContentsId)
  if (byIde.get(run.ide.id) === run) byIde.delete(run.ide.id)
  run.host.stop()
  if (!run.win.isDestroyed()) run.win.close()
  toIde(run, 'run:ended', { runId: run.id, reason, code } satisfies RunEnded)
  scheduleDockRestore(run.ide)
}

export function stopRunFor(ideWindowId: number): void {
  const run = byIde.get(ideWindowId)
  if (!run) return
  run.stopping = true
  endRun(run, 'stopped')
}

/**
 * Cria o processo Python de uma execução. Mensagens e término de um processo que já foi SUBSTITUÍDO (na
 * pré-visualização ao vivo) são ignorados: o fim do antigo não pode encerrar a execução nem o que ele ainda
 * diz pode aparecer na tela.
 */
function attachHost(run: Run, python: PythonCommand, runtime: string, dir: string): PythonHost {
  const host: PythonHost = new PythonHost(python, runtime, dir, {
    onMessage: (msg) => {
      if (run.host === host) onPythonMessage(run, msg)
    },
    onExit: (code, stderr) => {
      if (run.ended || run.host !== host) return
      const detail = stderr ? `\n${stderr}` : ''
      ideConsole(run, {
        level: 'error',
        text: `O processo Python terminou inesperadamente (código ${code ?? '?'}).${detail}`
      })
      endRun(run, 'crashed', code)
    }
  })
  run.host = host
  return host
}

function onPythonMessage(run: Run, msg: PyMessage): void {
  switch (msg.type) {
    case 'console': {
      const level = msg.level === 'warn' || msg.level === 'error' ? msg.level : 'info'
      ideConsole(run, {
        level,
        text: String(msg.text ?? ''),
        line: typeof msg.line === 'number' ? msg.line : undefined,
        file: typeof msg.file === 'string' ? msg.file : undefined
      })
      break
    }
    case 'patch':
      if (!run.win.isDestroyed()) run.win.webContents.send('run:message', msg)
      break
    case 'message':
      if (!run.win.isDestroyed())
        void dialog.showMessageBox(run.win, {
          type: 'info',
          title: String(msg.title ?? ''),
          message: String(msg.text ?? ''),
          buttons: ['OK']
        })
      break
    case 'close':
      if (!run.win.isDestroyed()) run.win.close()
      break
    default:
      break // loaded, pong...
  }
}

async function startRun(e: IpcMainInvokeEvent, raw: unknown): Promise<RunStartResult> {
  const ide = BrowserWindow.fromWebContents(e.sender)
  if (!ide) return { ok: false, error: 'Janela não encontrada.' }
  const dir = getProjectDir(ide.id)
  if (!dir) return { ok: false, error: 'Nenhum projeto aberto.' }
  const payload = parsePayload(raw)
  if (!payload) return { ok: false, error: 'Dados de execução inválidos.' }
  const runtime = runtimeScript()
  if (!runtime) return { ok: false, error: 'Arquivos do runtime Python não encontrados (pasta python/).' }

  const existing = byIde.get(ide.id)
  const reuse = payload.reuse === true
  if (reuse && (!existing || existing.ended || existing.win.isDestroyed())) return { ok: false, error: NO_PREVIEW_WINDOW }
  if (!reuse) stopRunFor(ide.id) // só uma execução por vez

  let python
  try {
    python = await findPython()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  let script = ''
  let scriptPath: string
  try {
    scriptPath = insideProject(dir, payload.scriptPath)
    script = typeof payload.script === 'string' ? payload.script : await fs.readFile(scriptPath, 'utf8')
  } catch (err) {
    if (!(err instanceof Error) || (err as NodeJS.ErrnoException).code !== 'ENOENT')
      return { ok: false, error: `Não foi possível ler o script: ${err instanceof Error ? err.message : String(err)}` }
    scriptPath = payload.scriptPath // não existe: roda só o layout, avisando no console
  }

  const { doc } = payload

  if (reuse && existing) {
    // Pré-visualização ao vivo: a janela fica (posição e tamanho dela) e só o Python é trocado.
    const previous = existing.init.doc
    const oldHost = existing.host
    existing.init = { doc, components: payload.components }
    existing.scriptPath = payload.scriptPath
    existing.script = script
    existing.loaded = false
    attachHost(existing, python, runtime, dir).start()
    oldHost.stop()
    if (previous.width !== doc.width || previous.height !== doc.height)
      existing.win.setContentSize(Math.min(Math.max(Math.round(doc.width), 200), 2400), Math.min(Math.max(Math.round(doc.height), 120), 1600))
    existing.win.setTitle(doc.title || payload.formName)
    existing.win.webContents.send('run:reload')
    return { ok: true, runId: existing.id }
  }

  const win = new BrowserWindow({
    useContentSize: true,
    width: Math.min(Math.max(Math.round(doc.width), 200), 2400),
    height: Math.min(Math.max(Math.round(doc.height), 120), 1600),
    minWidth: 200,
    minHeight: 120,
    show: false,
    title: doc.title || payload.formName,
    backgroundColor: '#f6f5f1',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.setMenuBarVisibility(false)
  if (payload.dock === true) dockBeside(ide, win, doc.width, doc.height)

  const run: Run = {
    id: nextRunId++,
    ide,
    win,
    winContentsId: win.webContents.id,
    init: { doc, components: payload.components },
    scriptPath: payload.scriptPath,
    script,
    loaded: false,
    ended: false,
    stopping: false,
    host: null as unknown as PythonHost
  }
  attachHost(run, python, runtime, dir)

  byRunWindow.set(run.winContentsId, run)
  byIde.set(ide.id, run)
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => endRun(run, run.stopping ? 'stopped' : 'closed'))
  ide.once('closed', () => stopRunFor(ide.id))
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (!existsSync(scriptPath))
    ideConsole(run, { level: 'warn', text: `Script ${payload.scriptPath} não encontrado: executando só o layout.` })
  ideConsole(run, {
    level: 'info',
    text: `Executando "${payload.formName}" (layout atual + ${basename(payload.scriptPath)} ${typeof payload.script === 'string' ? 'do editor, ainda não salvo' : 'do disco'}, Python ${python.version})`
  })

  run.host.start()
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}#run`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'run' })
  return { ok: true, runId: run.id }
}

function isToPython(v: unknown): v is RunToPython {
  if (typeof v !== 'object' || v === null) return false
  const m = v as Record<string, unknown>
  if (typeof m.id !== 'string') return false
  if (m.type === 'sync') return typeof m.prop === 'string'
  if (m.type === 'event') return typeof m.name === 'string'
  return false
}

export function registerRunIpc(): void {
  ipcMain.handle('run:start', startRun)
  ipcMain.handle('run:stop', (e: IpcMainInvokeEvent) => {
    const ide = BrowserWindow.fromWebContents(e.sender)
    if (ide) stopRunFor(ide.id)
  })
  // Chamadas da própria janela de execução (só ela tem uma entrada em byRunWindow):
  ipcMain.handle('run:init', (e: IpcMainInvokeEvent) => byRunWindow.get(e.sender.id)?.init ?? null)
  ipcMain.on('run:ready', (e: IpcMainEvent) => {
    const run = byRunWindow.get(e.sender.id)
    if (!run || run.loaded) return
    run.loaded = true
    const { doc, components } = run.init
    run.host.send({
      type: 'load_form',
      form: { name: doc.name, title: doc.title, width: doc.width, height: doc.height },
      components,
      script: run.script,
      script_name: basename(run.scriptPath)
    })
  })
  ipcMain.on('run:send', (e: IpcMainEvent, msg: unknown) => {
    const run = byRunWindow.get(e.sender.id)
    if (run && isToPython(msg)) run.host.send(msg)
  })
  app.on('before-quit', () => [...byIde.keys()].forEach(stopRunFor))
}
