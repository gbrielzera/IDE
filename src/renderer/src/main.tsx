import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { RunApp } from './runtime/RunWindow'
import { initTheme } from './theme'
import './styles.css'

initTheme()

// A janela de execução carrega a mesma página, com `#run` no endereço.
const isRunWindow = window.location.hash === '#run'

createRoot(document.getElementById('root')!).render(<StrictMode>{isRunWindow ? <RunApp /> : <App />}</StrictMode>)
