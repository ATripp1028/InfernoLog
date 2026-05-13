export class ApiError extends Error {
  body: unknown

  constructor(public status: number, message: string, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.body = body
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  token: string
  body?: unknown
}

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
