/**
 * Unit tests for the public Discord OAuth callback.
 *
 * This route is unauthenticated — the browser arrives straight from Discord
 * with no JWT, and the signed `state` is the only thing binding the callback to
 * a user. So the tests care most about which userId the link lands on, and that
 * every failure ends as a redirect carrying a reason rather than an error page
 * (the frontend has nothing else to show). Prisma, fetch and the state verifier
 * are mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'

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

const { mockVerifyState } = vi.hoisted(() => ({ mockVerifyState: vi.fn() }))
vi.mock('../../utils/discordState', () => ({
  verifyConnectDiscordState: mockVerifyState,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const app = (await import('./discord')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const USER_ID = 'user-1'
const DISCORD_ID = '987654321'
const FRONTEND = 'https://app.test'

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

/** Queues the token exchange then the /users/@me lookup, in that order. */
function mockDiscordHappyPath() {
  mockFetch
    .mockResolvedValueOnce(res(200, { access_token: 'discord-token' }))
    .mockResolvedValueOnce(res(200, { id: DISCORD_ID }))
}

function callback(query = 'code=auth-code&state=signed-state') {
  return app.request(`/discord/callback?${query}`)
}

/** The `reason` query param of a redirect Location, or null if not an error. */
function failureReason(response: Response): string | null {
  const location = new URL(response.headers.get('location')!)
  return location.searchParams.get('reason')
}

/** A P2002 unique-constraint error, as Prisma raises it. */
function uniqueViolation(): Error {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.user.update.mockReset().mockResolvedValue({} as never)
  mockFetch.mockReset()
  mockVerifyState.mockReset().mockReturnValue({
    userId: USER_ID,
    nonce: 'n',
    exp: 9_999_999_999,
  })
  vi.stubEnv('FRONTEND_URL', FRONTEND)
  vi.stubEnv('DISCORD_REDIRECT_URI', 'https://api.test/auth/discord/callback')
  vi.stubEnv('DISCORD_CLIENT_ID', 'client-id')
  vi.stubEnv('DISCORD_CLIENT_SECRET', 'client-secret')
})

// ─── success ─────────────────────────────────────────────────────────────────

describe('GET /discord/callback — success', () => {
  it('links the Discord id and redirects back to settings', async () => {
    mockDiscordHappyPath()

    const response = await callback()

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      `${FRONTEND}/settings?discord=connected&discordId=${DISCORD_ID}`
    )
  })

  it('writes the link against the userId from the signed state', async () => {
    // The state is the only proof of who started the flow — a query param or
    // the Discord id itself must never be the source of identity here.
    mockDiscordHappyPath()

    await callback()

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { discordId: DISCORD_ID },
    })
  })

  it('exchanges the code with the configured client credentials', async () => {
    mockDiscordHappyPath()

    await callback('code=auth-code&state=signed-state')

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://discord.com/api/oauth2/token')
    const body = init.body as URLSearchParams
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('auth-code')
    expect(body.get('client_id')).toBe('client-id')
    expect(body.get('client_secret')).toBe('client-secret')
  })

  it('presents the access token as a bearer on the user lookup', async () => {
    mockDiscordHappyPath()

    await callback()

    const [url, init] = mockFetch.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('https://discord.com/api/users/@me')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer discord-token'
    )
  })

  it('percent-encodes the Discord id into the redirect', async () => {
    mockFetch
      .mockResolvedValueOnce(res(200, { access_token: 'discord-token' }))
      .mockResolvedValueOnce(res(200, { id: 'weird id&x=1' }))

    const response = await callback()

    expect(response.headers.get('location')).toContain('weird%20id%26x%3D1')
  })
})

// ─── failures ────────────────────────────────────────────────────────────────

describe('GET /discord/callback — failures redirect with a reason', () => {
  it('rejects a missing code before verifying anything', async () => {
    const response = await callback('state=signed-state')

    expect(failureReason(response)).toBe('missing_code')
    expect(mockVerifyState).not.toHaveBeenCalled()
  })

  it('rejects a missing state', async () => {
    const response = await callback('code=auth-code')

    expect(failureReason(response)).toBe('missing_state')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects an unverifiable state without calling Discord', async () => {
    // A forged/expired state must not reach the token exchange at all.
    mockVerifyState.mockReturnValue(null)

    const response = await callback()

    expect(failureReason(response)).toBe('invalid_state')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('reports a failed token exchange', async () => {
    mockFetch.mockResolvedValueOnce(res(400, { error: 'invalid_grant' }))

    const response = await callback()

    expect(failureReason(response)).toBe('token_exchange_failed')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('reports a failed user lookup', async () => {
    mockFetch
      .mockResolvedValueOnce(res(200, { access_token: 'discord-token' }))
      .mockResolvedValueOnce(res(401, {}))

    const response = await callback()

    expect(failureReason(response)).toBe('user_fetch_failed')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('reports a Discord account already linked to someone else', async () => {
    // P2002 on discordId — a distinct, user-actionable reason rather than a
    // generic error, since the fix is to unlink from the other account.
    mockDiscordHappyPath()
    prisma.user.update.mockRejectedValue(uniqueViolation())

    const response = await callback()

    expect(failureReason(response)).toBe('already_linked_elsewhere')
  })

  it('falls back to an internal error for an unexpected write failure', async () => {
    mockDiscordHappyPath()
    prisma.user.update.mockRejectedValue(new Error('connection lost'))

    const response = await callback()

    expect(failureReason(response)).toBe('internal_error')
  })

  it('never surfaces an error page — every failure is a redirect', async () => {
    mockFetch.mockRejectedValue(new TypeError('network down'))

    const response = await callback()

    expect(response.status).toBe(302)
    expect(failureReason(response)).toBe('internal_error')
  })

  it('sends every failure back to the settings page', async () => {
    mockVerifyState.mockReturnValue(null)

    const location = new URL((await callback()).headers.get('location')!)

    expect(location.origin + location.pathname).toBe(`${FRONTEND}/settings`)
    expect(location.searchParams.get('discord')).toBe('error')
  })
})
