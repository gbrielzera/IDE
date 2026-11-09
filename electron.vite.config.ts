import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// electron-vite 6: as dependências do main/preload já são externalizadas por padrão.
export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        // O Monaco restringe os caminhos de importação (exports); o alias dá acesso direto aos módulos ESM.
        '@monaco': resolve('node_modules/monaco-editor/esm/vs'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
