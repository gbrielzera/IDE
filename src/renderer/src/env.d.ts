import type { VformApi } from '@shared/project'

declare global {
  interface Window {
    vform: VformApi
  }
}

export {}
