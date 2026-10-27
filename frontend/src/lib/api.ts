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

async function request<T>(method: Method, path: string, body?: unknown, timeoutMs = 10_000): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!response.ok) {
    const detail = await response
      .json()
      .then((problem: { detail?: string; message?: string }) => problem.detail || problem.message)
      .catch(() => null)
    throw new Error(detail || `${method} ${path} failed (${response.status})`)
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

let requestQueue: Promise<unknown> = Promise.resolve()

/** Queue a write. Failures don't throw; they show in the app shell. Resolves with the response, or null. */
export function send<T = unknown>(method: Method, path: string, body?: unknown): Promise<T | null> {
  if (!sync.remote) return Promise.resolve(null)
  const queuedRequest = requestQueue.then(() => request<T>(method, path, body)).then(
    (result) => {
      sync.error = null
      return result
    },
    (error: Error) => {
      sync.error = error.message
      return null
    }
  )
  requestQueue = queuedRequest
  return queuedRequest
}

/** The whole document, or null when there's no API to talk to. */
export async function loadRemote(): Promise<FinanceData | null> {
  try {
    return await request<FinanceData>('GET', '/data', undefined, 3000)
  } catch {
    return null
  }
}

/** Encode an id or date for use inside a URL path. */
export const encodePathPart = encodeURIComponent
