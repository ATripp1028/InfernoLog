/**
 * A non-2xx response from the API.
 *
 * `message` is the server's `error`/`message` field when it sent one,
 * otherwise a generic "Request failed (<status>)". `body` keeps the parsed
 * JSON so callers can branch on a machine-readable code — see
 * `collectionErrorCode` for the pattern.
 */
export class ApiError extends Error {
  body: unknown

  constructor(
    public status: number,
    message: string,
    body: unknown = null
  ) {
    super(message)
    this.name = 'ApiError'
    this.body = body
  }
}

/**
 * Renders a retry delay as the coarse phrase a wait message wants
 * ("a moment" / "about 3 minutes"), rather than an exact countdown — the value
 * is a refill estimate, and a ticking number invites watching the clock to
 * resume spamming.
 *
 * @param seconds - Seconds to wait.
 */
export function formatRetryWait(seconds: number): string {
  if (seconds < 60) return 'a moment'
  const minutes = Math.ceil(seconds / 60)
  return `about ${minutes} minute${minutes === 1 ? '' : 's'}`
}

/**
 * Reads the retry hint off a 429 from the API.
 *
 * The server sends `retryAfterSeconds` in the JSON body (alongside the
 * `Retry-After` header, which `fetch` exposes but our thrown ApiError does
 * not carry). Falls back to a minute when the body isn't the expected shape,
 * so callers always have something concrete to show rather than having to
 * handle a null.
 *
 * @param error - The rejected request's error.
 * @returns Seconds to wait before retrying.
 */
export function retryAfterSeconds(error: unknown): number {
  const DEFAULT = 60
  if (!(error instanceof ApiError)) return DEFAULT
  const body = error.body
  if (body && typeof body === 'object' && 'retryAfterSeconds' in body) {
    const value = (body as { retryAfterSeconds: unknown }).retryAfterSeconds
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.ceil(value)
    }
  }
  return DEFAULT
}


/**
 * Options for {@link apiFetch}. `body` is any JSON-serializable value (not a
 * `BodyInit`); the Content-Type header is set for you when it is present.
 */
export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  token: string
  body?: unknown
}

/**
 * Calls the InfernoLog API with a bearer token, parsing JSON both ways.
 *
 * @param path - Path only; `VITE_API_URL` is prepended.
 * @returns The parsed body, or `undefined` for a 204.
 * @throws {ApiError} On any non-2xx response, carrying the status and the
 * parsed error body.
 */
export async function apiFetch<T = unknown>(
  path: string,
  { token, body, headers, ...rest }: ApiFetchOptions
): Promise<T> {
  const init: RequestInit = {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  }
  if (body !== undefined) init.body = JSON.stringify(body)

  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, init)

  if (!res.ok) {
    let errBody: unknown = null
    try {
      errBody = await res.json()
    } catch {
      // non-JSON error body
    }
    const message = extractMessage(errBody) ?? `Request failed (${res.status})`
    throw new ApiError(res.status, message, errBody)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const obj = body as Record<string, unknown>
  if (typeof obj.error === 'string') return obj.error
  if (typeof obj.message === 'string') return obj.message
  return null
}
