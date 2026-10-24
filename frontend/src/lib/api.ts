import { reactive } from 'vue'
import type { FinanceData } from '../types'

// Talks to the Spring Boot API (backend/). The store saves optimistically: it changes local state
// first, then sends the change here. Calls run one at a time, in order, so a new category always
// reaches the server before the entry that uses it.
//
// When there's no API (the single-file preview, or `npm run dev` without the backend running)
// the app keeps working from the bundled seed and localStorage, as the prototype did.

export const sync = reactive({
  /** true once the API answered at startup; the store then saves there instead of localStorage */
  remote: false,
  /** the last failed save, shown in the app shell */
  error: null as string | null
})

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function request<T>(method: Method, path: string, body?: unknown, timeout = 10_000): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  })
  if (!res.ok) {
    const detail = await res.json().then((j: { detail?: string; message?: string }) => j.detail || j.message).catch(() => null)
    throw new Error(detail || `${method} ${path} failed (${res.status})`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

let queue: Promise<unknown> = Promise.resolve()

/** Queue a write. Failures don't throw; they show in the app shell. Resolves with the response, or null. */
export function send<T = unknown>(method: Method, path: string, body?: unknown): Promise<T | null> {
  if (!sync.remote) return Promise.resolve(null)
  const p = queue.then(() => request<T>(method, path, body)).then(
    (r) => {
      sync.error = null
      return r
    },
    (e: Error) => {
      sync.error = e.message
      return null
    }
  )
  queue = p
  return p
}

/** The whole document, or null when there's no API to talk to. */
export async function loadRemote(): Promise<FinanceData | null> {
  try {
    return await request<FinanceData>('GET', '/data', undefined, 3000)
  } catch {
    return null
  }
}

export const enc = encodeURIComponent
