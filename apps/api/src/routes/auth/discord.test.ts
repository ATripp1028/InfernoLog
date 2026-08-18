/**
 * Unit tests for the public Discord OAuth redirect target.
 *
 * This route used to exchange the code and write `discordId`, and most of what
 * this file tested lives in routes/account/discord.ts now — see that module's
 * tests for the exchange, the write, and the authorization check that made the
 * move necessary. What is left here is a bouncer, and the tests are about the
 * two properties a bouncer has to have: it forwards what Discord gave it, and
 * it does nothing else.
 *
 * "Does nothing else" is the security-relevant half. This is the one
 * unauthenticated entry point in the linking flow, so a test that it touches
 * neither Prisma nor the network is a test that the flow's only write cannot
 * be reached without a JWT.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const app = (await import('./discord')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const FRONTEND = 'https://app.test'

function callback(query: Record<string, string>) {
  const qs = new URLSearchParams(query)
  return app.request(`/discord/callback?${qs}`)
}

/** The Location header of a redirect, parsed. */
async function locationOf(res: Response): Promise<URL> {
  return new URL(res.headers.get('location')!)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('FRONTEND_URL', FRONTEND)
})

// ─── forwarding ──────────────────────────────────────────────────────────────

describe('GET /discord/callback — forwarding', () => {
  it('sends the browser to the authenticated completion page', async () => {
    const url = await locationOf(
      await callback({ code: 'abc', state: 'signed-state' })
    )

    expect(url.origin + url.pathname).toBe(`${FRONTEND}/auth/discord/complete`)
  })

  it('forwards the code and state unchanged', async () => {
    const url = await locationOf(
      await callback({ code: 'abc', state: 'signed-state' })
    )

    expect(url.searchParams.get('code')).toBe('abc')
    expect(url.searchParams.get('state')).toBe('signed-state')
  })

  it('encodes values that would otherwise break the query string', async () => {
    const url = await locationOf(
      await callback({ code: 'a&b=c d', state: 'x/y+z' })
    )

    expect(url.searchParams.get('code')).toBe('a&b=c d')
    expect(url.searchParams.get('state')).toBe('x/y+z')
  })

  it('forwards a state it cannot vouch for', async () => {
    // The bouncer deliberately does not verify the signature: one place
    // decides whether a state is trustworthy, and it is the endpoint that acts
    // on it. Forwarding garbage costs nothing, because this route grants
    // nothing.
    const url = await locationOf(
      await callback({ code: 'abc', state: 'not-a-real-state' })
    )

    expect(url.pathname).toBe('/auth/discord/complete')
  })
})

// ─── the bouncer grants nothing ──────────────────────────────────────────────

describe('GET /discord/callback — does nothing but redirect', () => {
  it('never touches the database', async () => {
    await callback({ code: 'abc', state: 'signed-state' })

    // The linking write now lives behind the JWT. If this route ever regains a
    // Prisma call, the unauthenticated CSRF path is back.
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('never calls Discord', async () => {
    await callback({ code: 'abc', state: 'signed-state' })

    // No token exchange here means the authorization code is still unspent
    // when it reaches the authenticated endpoint, which is what lets that
    // endpoint refuse before spending it.
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('always redirects — never renders an error', async () => {
    // The user's browser is mid-OAuth-redirect; an error body would be a dead
    // end with no way back into the app.
    for (const query of [
      { code: 'abc', state: 's' },
      { code: 'abc' },
      { state: 's' },
      {},
      { error: 'access_denied' },
    ]) {
      expect((await callback(query)).status).toBe(302)
    }
  })
})

// ─── failures ────────────────────────────────────────────────────────────────

describe('GET /discord/callback — failures', () => {
  it.each([
    ['a declined consent screen', { error: 'access_denied' }, 'cancelled'],
    ['a missing code', { state: 's' }, 'missing_code'],
    ['a missing state', { code: 'abc' }, 'missing_state'],
    ['an empty redirect', {}, 'missing_code'],
  ])('reports %s as %s', async (_label, query, reason) => {
    const url = await locationOf(await callback(query))

    expect(url.origin + url.pathname).toBe(`${FRONTEND}/settings`)
    expect(url.searchParams.get('discord')).toBe('error')
    expect(url.searchParams.get('reason')).toBe(reason)
  })

  it('treats a denial as a denial even when Discord echoes a state', async () => {
    // Discord sends back ?error=access_denied&state=… — without the explicit
    // error check that reads as a plain missing code.
    const url = await locationOf(
      await callback({ error: 'access_denied', state: 's' })
    )

    expect(url.searchParams.get('reason')).toBe('cancelled')
  })
})
