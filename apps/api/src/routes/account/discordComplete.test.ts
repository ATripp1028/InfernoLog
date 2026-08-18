/**
 * Unit tests for POST /v1/me/connect-discord/complete.
 *
 * This endpoint is where the Discord linking flow is authorized. The public
 * redirect target cannot authenticate anyone, so it forwards the code and
 * state here; everything that decides whether a link may happen — and the only
 * write — is in this handler.
 *
 * The state helper is NOT mocked. The property under test is "a state minted
 * for one account cannot be redeemed by another", and stubbing the verifier
 * would replace exactly the code that establishes it. Real HMACs are minted
 * here against a test secret, so a signature check that silently stopped
 * working would fail these tests. Only Prisma and the Discord HTTP client are
 * mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import { buildApp, TEST_USER_ID } from '../../test/utils'

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

const { mockExchange, mockFetchUserId } = vi.hoisted(() => ({
  mockExchange: vi.fn(),
  mockFetchUserId: vi.fn(),
}))

vi.mock('../../utils/discord', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/discord')>()),
  exchangeDiscordCode: mockExchange,
  fetchDiscordUserId: mockFetchUserId,
}))

// The signing secret must exist before discordState is imported by the route.
vi.stubEnv('DISCORD_STATE_SECRET', 'test-state-secret')

const { default: discordApp } = await import('./discord')
const { mintConnectDiscordState } = await import('../../utils/discordState')
const { DiscordOAuthError } = await import('../../utils/discord')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const OTHER_USER_ID = '00000000-1111-2222-3333-444444444444'
const DISCORD_ID = '987654321'

/** A genuinely signed state for `userId`. */
function stateFor(userId: string) {
  return mintConnectDiscordState(userId, 'nonce-abc')
}

function complete(body: unknown, userId = TEST_USER_ID) {
  return buildApp(discordApp, { userId }).request(
    '/me/connect-discord/complete',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExchange.mockResolvedValue('discord-access-token')
  mockFetchUserId.mockResolvedValue(DISCORD_ID)
  prisma.user.update.mockResolvedValue({} as never)
})

// ─── the authorization check ─────────────────────────────────────────────────

describe('the state must name the caller', () => {
  it('refuses a state minted for a different account', async () => {
    // The account-linking CSRF: an attacker mints a state for their own
    // account and gets a victim to approve the Discord consent screen. The
    // victim's browser is the one that ends up holding the code, so the
    // completion request carries the VICTIM's identity and the ATTACKER's
    // state. That mismatch is the whole attack, and this is where it dies.
    const res = await complete({
      code: 'victims-code',
      state: stateFor(OTHER_USER_ID),
    })

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ reason: 'state_mismatch' })
  })

  it('never spends the code when the state names someone else', async () => {
    await complete({ code: 'victims-code', state: stateFor(OTHER_USER_ID) })

    // Refusing before the exchange means we never learn which Discord account
    // the code belonged to — the attacker gains no information at all, and the
    // code is still unspent for its rightful owner.
    expect(mockExchange).not.toHaveBeenCalled()
    expect(mockFetchUserId).not.toHaveBeenCalled()
  })

  it('writes nothing when the state names someone else', async () => {
    await complete({ code: 'victims-code', state: stateFor(OTHER_USER_ID) })

    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('links against the authenticated caller, never the state payload', async () => {
    await complete({ code: 'abc', state: stateFor(TEST_USER_ID) })

    // Belt and braces on the check above: even for a matching state, the id
    // written is the one from the JWT.
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: TEST_USER_ID },
      data: { discordId: DISCORD_ID },
    })
  })
})

// ─── state validity ──────────────────────────────────────────────────────────

describe('state validity', () => {
  it.each([
    ['a forged signature', 'nonce.user.999999.deadbeef'],
    ['a truncated state', 'nonce.user'],
    ['empty-ish junk', 'x.y.z.w'],
  ])('rejects %s', async (_label, state) => {
    const res = await complete({ code: 'abc', state })

    expect(res.status).toBe(400)
    expect(mockExchange).not.toHaveBeenCalled()
  })

  it('rejects a state whose signature was minted with a different secret', async () => {
    const good = stateFor(TEST_USER_ID)
    vi.stubEnv('DISCORD_STATE_SECRET', 'a-different-secret')

    const res = await complete({ code: 'abc', state: good })

    expect(res.status).toBe(400)
    vi.stubEnv('DISCORD_STATE_SECRET', 'test-state-secret')
  })

  it.each([
    ['no code', { state: 'x' }],
    ['no state', { code: 'x' }],
    ['an empty code', { code: '', state: 'x' }],
  ])('rejects a body with %s', async (_label, body) => {
    expect((await complete(body)).status).toBe(400)
  })
})

// ─── the happy path and upstream failures ────────────────────────────────────

describe('completing the link', () => {
  it('returns the linked Discord id', async () => {
    const res = await complete({ code: 'abc', state: stateFor(TEST_USER_ID) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { discordId: DISCORD_ID } })
  })

  it('exchanges the code before reading the identity', async () => {
    await complete({ code: 'abc', state: stateFor(TEST_USER_ID) })

    expect(mockExchange).toHaveBeenCalledWith('abc')
    expect(mockFetchUserId).toHaveBeenCalledWith('discord-access-token')
  })

  it('reports a Discord failure as an upstream fault, not ours', async () => {
    mockExchange.mockRejectedValue(new DiscordOAuthError('Discord rejected it'))

    const res = await complete({ code: 'abc', state: stateFor(TEST_USER_ID) })

    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ reason: 'exchange_failed' })
  })

  it('reports a Discord account already linked elsewhere', async () => {
    prisma.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '5',
      })
    )

    const res = await complete({ code: 'abc', state: stateFor(TEST_USER_ID) })

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      reason: 'already_linked_elsewhere',
    })
  })

  it('lets an unexpected write failure become a 500, not a linking verdict', async () => {
    prisma.user.update.mockRejectedValue(new Error('connection reset'))

    const res = await complete({ code: 'abc', state: stateFor(TEST_USER_ID) })

    // The handler only translates the two failures it recognises (P2002, and
    // Discord being unreachable). Anything else has to fall through to the
    // module's error handler rather than being reported as a linking outcome
    // the user could act on.
    expect(res.status).toBe(500)
  })
})
