import { reactive } from 'vue'
import type { FinanceData, UserProfile } from '../types'

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
  error: null as string | null,
  /** the signed-in Google account, when the server has a login */
  profile: null as UserProfile | null
})

/** Where the server starts Google sign-in. */
const SIGN_IN_PATH = '/oauth2/authorization/google'

/** Spring Security's CSRF token, which it keeps in a cookie the page can read and expects back in a header. */
function csrfToken(): string | null {
  const tokenCookie = document.cookie.split('; ').find((cookie) => cookie.startsWith('XSRF-TOKEN='))
  return tokenCookie ? decodeURIComponent(tokenCookie.slice('XSRF-TOKEN='.length)) : null
}

function requestHeaders(method: Method, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  if (hasBody) headers['Content-Type'] = 'application/json'
  const token = method === 'GET' ? null : csrfToken()
  if (token) headers['X-XSRF-TOKEN'] = token
  return headers
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function request<T>(method: Method, path: string, body?: unknown, timeoutMs = 10_000): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: requestHeaders(method, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  })
  // Signed out (or the session ran out): go through Google sign-in, which comes back to the app.
  if (response.status === 401) {
    location.assign(SIGN_IN_PATH)
    throw new Error('Signing in again')
  }
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

/** Who is signed in, or null when there's no API. */
export async function loadProfile(): Promise<UserProfile | null> {
  try {
    return await request<UserProfile>('GET', '/me', undefined, 3000)
  } catch {
    return null
  }
}

/** Ends the server session. The server then asks for Google sign-in again. */
export async function signOut(): Promise<void> {
  const token = csrfToken()
  await fetch('/logout', { method: 'POST', headers: token ? { 'X-XSRF-TOKEN': token } : undefined }).catch(() => null)
  location.assign('/')
}

/** Encode an id or date for use inside a URL path. */
export const encodePathPart = encodeURIComponent
