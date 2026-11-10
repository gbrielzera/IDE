// Grava docs/VForm.chm. Uso: `npm run manual`.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { manualBytes, MANUAL_PATH } from './build'

const out = join(process.cwd(), MANUAL_PATH)
mkdirSync(dirname(out), { recursive: true })
const bytes = manualBytes()
writeFileSync(out, bytes)
console.log(`Manual gerado: ${MANUAL_PATH} (${bytes.length} bytes)`)
