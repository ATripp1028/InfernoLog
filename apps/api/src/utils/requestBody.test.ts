/**
 * Unit tests for the shared request-body reader.
 *
 * This exists because the `.catch(() => ({}))` idiom it replaced could not tell
 * an unparseable body from an empty one — and `{}` validates against any
 * all-optional schema, so malformed input succeeded silently. The tests below
 * pin that distinction directly, plus the `invalidMessage` escape hatch used by
 * routes whose body carries a secret.
 */

import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { z } from 'zod'
import { parseJsonBody } from './requestBody'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Every field optional — the shape that made the old idiom unsafe. */
const AllOptionalSchema = z.object({
  name: z.string().optional(),
  count: z.number().optional(),
})

const RequiredSchema = z.object({ name: z.string() })

/**
 * Mounts a route that parses with `schema` and echoes the result, so the tests
 * see both the status and what the handler would have received.
 */
function appFor(
  schema: Parameters<typeof parseJsonBody>[1],
  options?: { invalidMessage?: string }
) {
  const app = new Hono()
  app.post('/', async (c) => {
    const parsed = await parseJsonBody(c, schema, options)
    if (!parsed.ok) return parsed.response
    return c.json({ received: parsed.data })
  })
  return app
}

function post(app: Hono, body: string) {
  return app.request('/', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── the distinction that matters ────────────────────────────────────────────

describe('parseJsonBody — unparseable vs empty', () => {
  it('rejects an unparseable body even when the schema accepts {}', async () => {
    // The whole point: `{}` is valid here, so a fallback would have succeeded.
    const res = await post(appFor(AllOptionalSchema), '{oops')

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Request body must be valid JSON',
    })
  })

  it('accepts a genuinely empty object', async () => {
    const res = await post(appFor(AllOptionalSchema), '{}')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: {} })
  })

  it('rejects a missing body', async () => {
    const app = appFor(AllOptionalSchema)
    const res = await app.request('/', { method: 'POST' })

    expect(res.status).toBe(400)
  })
})

// ─── validation ──────────────────────────────────────────────────────────────

describe('parseJsonBody — validation', () => {
  it('returns the parsed data on success', async () => {
    const res = await post(
      appFor(AllOptionalSchema),
      JSON.stringify({ name: 'x', count: 2 })
    )

    await expect(res.json()).resolves.toEqual({
      received: { name: 'x', count: 2 },
    })
  })

  it('400s with the flattened issues when validation fails', async () => {
    const res = await post(appFor(RequiredSchema), JSON.stringify({ name: 42 }))

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { fieldErrors: unknown } }
    expect(body.error).toHaveProperty('fieldErrors')
  })

  it('400s for a body that parses to a non-object', async () => {
    const res = await post(appFor(RequiredSchema), 'null')

    expect(res.status).toBe(400)
  })
})

// ─── invalidMessage ──────────────────────────────────────────────────────────

describe('parseJsonBody — invalidMessage', () => {
  const SECRET = 'super-secret-key'
  const KeySchema = z.object({ apiKey: z.string().min(8) })

  it('uses the fixed message for a validation failure', async () => {
    const app = appFor(KeySchema, {
      invalidMessage: 'A valid API key is required',
    })
    const res = await post(app, JSON.stringify({ apiKey: 'short' }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'A valid API key is required',
    })
  })

  it('uses the fixed message for an unparseable body too', async () => {
    const app = appFor(KeySchema, {
      invalidMessage: 'A valid API key is required',
    })
    const res = await post(app, '{oops')

    await expect(res.json()).resolves.toEqual({
      error: 'A valid API key is required',
    })
  })

  it('emits no per-field detail about the rejected body', async () => {
    // The reason the option exists: the default response carries a flattened
    // issue map keyed by field, and this route's fields hold the user's key.
    const withMessage = appFor(KeySchema, {
      invalidMessage: 'A valid API key is required',
    })
    const withoutMessage = appFor(KeySchema)
    const badBody = JSON.stringify({ apiKey: SECRET.slice(0, 3) })

    const guarded = (await (await post(withMessage, badBody)).json()) as {
      error: unknown
    }
    const unguarded = (await (await post(withoutMessage, badBody)).json()) as {
      error: unknown
    }

    expect(guarded.error).toBe('A valid API key is required')
    expect(unguarded.error).toHaveProperty('fieldErrors.apiKey')
  })
})
