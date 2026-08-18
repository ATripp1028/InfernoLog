import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  apiFetch,
  formatRetryWait,
  retryAfterSeconds,
} from '../client'

let fetchMock: ReturnType<typeof vi.fn>

/** A Response-shaped stub — jsdom's own Response is not needed here. */
function respondWith(
  init: { status?: number; json?: () => unknown } = {}
): void {
  const status = init.status ?? 200
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: init.json ?? (() => Promise.resolve({})),
  })
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test')
  fetchMock = vi.fn()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  respondWith()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** The RequestInit of the most recent call. */
const sentInit = () => fetchMock.mock.calls[0]![1] as RequestInit
/** The headers of the most recent call, as a plain object. */
const sentHeaders = () => sentInit().headers as Record<string, string>

describe('apiFetch', () => {
  describe('the request it builds', () => {
    it('prepends the configured API base to the path', async () => {
      await apiFetch('/v1/me', { token: 't' })

      expect(fetchMock.mock.calls[0]![0]).toBe('https://api.test/v1/me')
    })

    it('sends the token as a bearer credential', async () => {
      await apiFetch('/v1/me', { token: 'abc123' })

      expect(sentHeaders().Authorization).toBe('Bearer abc123')
    })

    it('passes the method through', async () => {
      await apiFetch('/v1/me', { token: 't', method: 'DELETE' })

      expect(sentInit().method).toBe('DELETE')
    })

    it('passes other request options through', async () => {
      const signal = new AbortController().signal

      await apiFetch('/v1/me', { token: 't', signal })

      expect(sentInit().signal).toBe(signal)
    })

    it('keeps a caller’s own headers', async () => {
      await apiFetch('/v1/me', { token: 't', headers: { 'X-Trace': 'id' } })

      expect(sentHeaders()['X-Trace']).toBe('id')
    })
  })

  // `body` is a value to serialize, not a BodyInit — the JSON encoding and its
  // Content-Type are the client's job so no caller has to remember both.
  describe('the body it serializes', () => {
    it('serializes the body as JSON', async () => {
      await apiFetch('/v1/levels', { token: 't', body: { id: '128' } })

      expect(sentInit().body).toBe('{"id":"128"}')
    })

    it('declares the content type when there is a body', async () => {
      await apiFetch('/v1/levels', { token: 't', body: {} })

      expect(sentHeaders()['Content-Type']).toBe('application/json')
    })

    it('declares no content type on a bodyless request', async () => {
      await apiFetch('/v1/me', { token: 't' })

      expect(sentHeaders()['Content-Type']).toBeUndefined()
      expect(sentInit().body).toBeUndefined()
    })

    // `null` is a meaningful payload — only an omitted body means "none".
    it('sends an explicit null body', async () => {
      await apiFetch('/v1/me', { token: 't', body: null })

      expect(sentInit().body).toBe('null')
    })
  })

  describe('the response it parses', () => {
    it('returns the parsed JSON body', async () => {
      respondWith({ json: () => Promise.resolve({ id: 'u1' }) })

      await expect(apiFetch('/v1/me', { token: 't' })).resolves.toEqual({
        id: 'u1',
      })
    })

    // A 204 has no body at all; parsing one would throw.
    it('returns undefined for a 204', async () => {
      respondWith({
        status: 204,
        json: () => Promise.reject(new Error('no body')),
      })

      await expect(apiFetch('/v1/me', { token: 't' })).resolves.toBeUndefined()
    })

    it('accepts any 2xx as success', async () => {
      respondWith({ status: 201, json: () => Promise.resolve({ ok: true }) })

      await expect(apiFetch('/v1/x', { token: 't' })).resolves.toEqual({
        ok: true,
      })
    })
  })

  describe('the errors it raises', () => {
    it('throws an ApiError carrying the status', async () => {
      respondWith({ status: 404, json: () => Promise.resolve({}) })

      await expect(apiFetch('/v1/me', { token: 't' })).rejects.toMatchObject({
        name: 'ApiError',
        status: 404,
      })
    })

    it('uses the server’s `error` field as the message', async () => {
      respondWith({
        status: 400,
        json: () => Promise.resolve({ error: 'Level already logged' }),
      })

      await expect(apiFetch('/v1/x', { token: 't' })).rejects.toThrow(
        'Level already logged'
      )
    })

    it('falls back to the server’s `message` field', async () => {
      respondWith({
        status: 400,
        json: () => Promise.resolve({ message: 'Bad request' }),
      })

      await expect(apiFetch('/v1/x', { token: 't' })).rejects.toThrow(
        'Bad request'
      )
    })

    it('prefers `error` when the server sends both', async () => {
      respondWith({
        status: 400,
        json: () =>
          Promise.resolve({ error: 'from error', message: 'from message' }),
      })

      await expect(apiFetch('/v1/x', { token: 't' })).rejects.toThrow(
        'from error'
      )
    })

    it('falls back to a generic message naming the status', async () => {
      respondWith({ status: 500, json: () => Promise.resolve({}) })

      await expect(apiFetch('/v1/x', { token: 't' })).rejects.toThrow(
        'Request failed (500)'
      )
    })

    // A gateway 502 or a CloudFront error page is HTML, not JSON — that must
    // surface as an ApiError with the status, not a parse crash.
    it('survives a non-JSON error body', async () => {
      respondWith({
        status: 502,
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      })

      await expect(apiFetch('/v1/x', { token: 't' })).rejects.toMatchObject({
        status: 502,
        message: 'Request failed (502)',
        body: null,
      })
    })

    it('ignores a non-string error field', async () => {
      respondWith({ status: 400, json: () => Promise.resolve({ error: 42 }) })

      await expect(apiFetch('/v1/x', { token: 't' })).rejects.toThrow(
        'Request failed (400)'
      )
    })

    // Callers branch on a machine-readable code in the body — see
    // collectionErrorCode — so the parsed body has to survive the throw.
    it('keeps the parsed error body for callers to branch on', async () => {
      const body = { error: 'Nope', code: 'WANT_TO_BEAT_COMPLETED' }
      respondWith({ status: 409, json: () => Promise.resolve(body) })

      await expect(apiFetch('/v1/x', { token: 't' })).rejects.toMatchObject({
        body,
      })
    })

    it('lets a network failure propagate as itself', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

      await expect(apiFetch('/v1/x', { token: 't' })).rejects.toThrow(TypeError)
    })
  })
})

describe('ApiError', () => {
  it('is a real Error', () => {
    const err = new ApiError(404, 'Not found')

    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ApiError')
  })

  it('is catchable by its own type', () => {
    expect(new ApiError(404, 'Not found')).toBeInstanceOf(ApiError)
  })

  it('carries no body when none was given', () => {
    expect(new ApiError(404, 'Not found').body).toBeNull()
  })
})

describe('retryAfterSeconds', () => {
  it('reads the hint the API sends in a 429 body', () => {
    const err = new ApiError(429, 'Too many', { retryAfterSeconds: 214 })

    expect(retryAfterSeconds(err)).toBe(214)
  })

  it('rounds a fractional hint up rather than down', () => {
    // Rounding down would tell the user to retry fractionally too early and
    // earn them a second 429.
    expect(
      retryAfterSeconds(
        new ApiError(429, 'Too many', { retryAfterSeconds: 1.2 })
      )
    ).toBe(2)
  })

  it.each([
    ['a non-ApiError', new Error('boom')],
    ['a body that is not an object', new ApiError(429, 'x', 'nope')],
    ['a body without the field', new ApiError(429, 'x', { error: 'x' })],
    [
      'a non-numeric value',
      new ApiError(429, 'x', { retryAfterSeconds: 'soon' }),
    ],
    ['a nonsense value', new ApiError(429, 'x', { retryAfterSeconds: -5 })],
  ])('falls back to a minute for %s', (_label, err) => {
    // Callers render this directly, so it must always be a usable number
    // rather than a null they each have to handle.
    expect(retryAfterSeconds(err)).toBe(60)
  })
})

describe('formatRetryWait', () => {
  it.each([
    [1, 'a moment'],
    [59, 'a moment'],
    [60, 'about 1 minute'],
    [61, 'about 2 minutes'],
    [214, 'about 4 minutes'],
  ])('renders %ds as %s', (seconds, expected) => {
    expect(formatRetryWait(seconds)).toBe(expected)
  })

  it('rounds up so the stated wait is never short', () => {
    expect(formatRetryWait(121)).toBe('about 3 minutes')
  })
})
