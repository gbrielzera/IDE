import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  workers: 1,
  // O arraste nativo (HTML5) simulado pelo Playwright perde, raramente, a corrida contra o Chromium
  // quando a máquina está sob carga (nunca em execução isolada). Uma retentativa evita falso
  // vermelho, e o relatório marca como "flaky" o teste que precisou dela.
  retries: 1,
  reporter: 'list'
})
