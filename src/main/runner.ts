import { app, BrowserWindow, dialog, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { existsSync, promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type { FormDocument } from '@shared/project'
import type { RunConsoleMessage, RunEnded, RunInit, RunPayload, RunStartResult, RunToPython } from '@shared/run'
import { getProjectDir, insideProject } from './projectFs'
import { findPython, PythonHost, type PyMessage } from './pythonHost'

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

function endRun(run: Run, reason: RunEnded['reason'], code: number | null = null): void {
  if (run.ended) return
  run.ended = true
  byRunWindow.delete(run.winContentsId)
  if (byIde.get(run.ide.id) === run) byIde.delete(run.ide.id)
  run.host.stop()
  if (!run.win.isDestroyed()) run.win.close()
  toIde(run, 'run:ended', { runId: run.id, reason, code } satisfies RunEnded)
}

export function stopRunFor(ideWindowId: number): void {
  const run = byIde.get(ideWindowId)
  if (!run) return
  run.stopping = true
  endRun(run, 'stopped')
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

  stopRunFor(ide.id) // só uma execução por vez

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
    script = await fs.readFile(scriptPath, 'utf8')
  } catch (err) {
    if (!(err instanceof Error) || (err as NodeJS.ErrnoException).code !== 'ENOENT')
      return { ok: false, error: `Não foi possível ler o script: ${err instanceof Error ? err.message : String(err)}` }
    scriptPath = payload.scriptPath // não existe: roda só o layout, avisando no console
  }

  const { doc } = payload
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
  run.host = new PythonHost(python, runtime, dir, {
    onMessage: (msg) => onPythonMessage(run, msg),
    onExit: (code, stderr) => {
      if (run.ended) return
      const detail = stderr ? `\n${stderr}` : ''
      ideConsole(run, {
        level: 'error',
        text: `O processo Python terminou inesperadamente (código ${code ?? '?'}).${detail}`
      })
      endRun(run, 'crashed', code)
    }
  })

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
    text: `Executando "${payload.formName}" (layout atual + ${basename(payload.scriptPath)} do disco, Python ${python.version})`
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
