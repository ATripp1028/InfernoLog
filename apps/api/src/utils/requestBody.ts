// Reading a validated JSON request body.
//
// Replaces the `await c.req.json().catch(() => ({}))` idiom this codebase used
// to repeat at every write route. That idiom cannot tell "the body would not
// parse" from "the body parsed to an empty object", and `{}` is itself VALID
// against any schema whose fields are all optional — so an unparseable request
// silently succeeded as a no-op. On POST /v1/me/import/check that meant
// answering "no conflicts" without examining anything; on
// PATCH /v1/me/ranking/classic/:id it moved the entry to the easiest end.

import type { Context } from 'hono'

/**
 * The minimal surface needed from a schema, declared structurally rather than
 * as a zod type on purpose: `packages/core` is on zod@3 while this app is on
 * zod@4, and naming either one here would make the helper accept only that
 * half. See CLAUDE.md on the api↔core zod split — parse with core's schemas,
 * don't build on them.
 */
interface BodySchema<T> {
  safeParse(
    value: unknown
  ):
    | { success: true; data: T }
    | { success: false; error: { flatten(): unknown } }
}

/** Either the validated body, or the 400 the caller should return. */
export type ParsedBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response }

/**
 * Reads a request's JSON body and validates it against `schema`.
 *
 * Rejects an unparseable body outright rather than falling back to `{}` — the
 * fallback is indistinguishable from a legitimately empty object for any
 * all-optional schema, which turns malformed input into a silent success.
 *
 * @param c - The Hono context for the request.
 * @param schema - Any zod schema (either major version), or anything else
 * exposing a compatible `safeParse`.
 * @param options - `invalidMessage` replaces BOTH failure messages with a
 * fixed string, for routes whose body carries a secret and so must never be
 * echoed back in a validation error.
 * @returns `{ ok: true, data }` with the parsed body, or `{ ok: false,
 * response }` carrying the 400 to return unchanged.
 */
export async function parseJsonBody<T>(
  c: Context,
  schema: BodySchema<T>,
  options: { invalidMessage?: string } = {}
): Promise<ParsedBody<T>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return {
      ok: false,
      response: c.json(
        { error: options.invalidMessage ?? 'Request body must be valid JSON' },
        400
      ),
    }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      response: c.json(
        {
          error: options.invalidMessage ?? parsed.error.flatten(),
        },
        400
      ),
    }
  }

  return { ok: true, data: parsed.data }
}
