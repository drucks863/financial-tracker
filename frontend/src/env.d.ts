/// <reference types="vite/client" />

declare module '@seed' {
  import type { FinanceData } from './types'
  const data: FinanceData
  export default data
}

// Present when the page runs as a claude.ai artifact preview.
interface Window {
  claude?: {
    use(name: 'downloads'): Promise<{
      save(req: { filename: string; data: string | Blob | ArrayBuffer | ArrayBufferView }): Promise<{ status: 'saved' | 'delivered' }>
    } | null>
  }
}
