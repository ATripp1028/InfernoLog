/**
 * Leak test for the shared error handling every credential route relies on.
 *
 * A 500 is where request bodies usually escape: an error handler that logs
 * "the request" or attaches it to a report. This drives credential-carrying
 * bodies through the real `createErrorHandler` tail and `parseJsonBody`, and
 * asserts nothing reaches the logger, Sentry, or the response.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { z } from 'zod'
import type { RouteEnv } from './errors'

vi.mock('../utils/logger', async () => {
  const { leakCapture } = await import('../test/captureLeaks')
  return { logger: leakCapture.logger }
})
vi.mock('@sentry/node', async () => {
  const { leakCapture } = await import('../test/captureLeaks')
  return leakCapture.sentry
})

const { leakCapture, leakSentinel } = await import('../test/captureLeaks')
const { createErrorHandler } = await import('./errors')
const { parseJsonBody } = await import('../utils/requestBody')
const { Sensitive } = await import('../utils/sensitive')
const { logger } = await import('../utils/logger')

const BodySchema = z.object({
  email: z.string(),
  password: z.string().min(8),
  verificationCode: z.string().regex(/^\d{6}$/),
})

function buildApp() {
  const app = new Hono<RouteEnv>()
  app.onError(createErrorHandler('LeakTest'))
  app.post('/fail', async (c) => {
    const body = await parseJsonBody(c, BodySchema)
    if (!body.ok) return body.response
    // A realistic accident the lint rule cannot see, because the name gives
    // nothing away: the wrapped credential logged as context, then an
    // unrelated failure. `Sensitive` is what has to hold here.
    const credential = new Sensitive(body.data.password)
    logger.info({ email: body.data.email, credential }, 'Attempting signup')
    throw new Error('Cognito unavailable')
  })
  return app
}

function post(app: Hono<RouteEnv>, payload: unknown) {
  return app.request('/fail', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
}

beforeEach(() => leakCapture.reset())

describe('credential leaks through shared error handling', () => {
  it('a forced 500 logs and reports the error without the body', async () => {
    const password = leakSentinel('password')
    const verificationCode = leakSentinel('code')
    const res = await post(buildApp(), {
      email: 'a@b.co',
      password,
      verificationCode: '123456',
    })

    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain(password)
    // The failure was reported — the capture is not trivially empty.
    expect(leakCapture.sentryCalls()).toHaveLength(1)
    expect(leakCapture.output()).toContain('Cognito unavailable')
    leakCapture.expectNoLeak(password, verificationCode)
  })

  it('a validation failure echoes neither credential in the 400', async () => {
    const password = leakSentinel('password')
    const verificationCode = leakSentinel('code')
    const res = await post(buildApp(), {
      email: 'a@b.co',
      password,
      verificationCode, // not six digits, so validation fails
    })

    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).not.toContain(password)
    expect(text).not.toContain(verificationCode)
    leakCapture.expectNoLeak(password, verificationCode)
  })

  it('an unparseable body is refused without echoing it', async () => {
    const password = leakSentinel('password')
    const res = await post(buildApp(), `{"password":"${password}"`)
    expect(res.status).toBe(400)
    expect(await res.text()).not.toContain(password)
    leakCapture.expectNoLeak(password)
  })

  it('the capture itself catches a leak', async () => {
    const password = leakSentinel('password')
    leakCapture.logger.info({ note: `oops ${password}` }, 'leaky')
    expect(() => leakCapture.expectNoLeak(password)).toThrow()
  })
})
