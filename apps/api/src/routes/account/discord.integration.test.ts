/**
 * Integration tests for connecting and disconnecting Discord.
 *
 * Drives the whole round trip against a real database: mint a state on the
 * authenticated start endpoint, bounce it through the public redirect target
 * the way Discord would, and redeem it on the authenticated completion
 * endpoint. `User.discordId` is unique, so "already linked to another user" is
 * a real constraint rather than a mocked one.
 *
 * The case this file exists for is `redeeming someone else's state`: the
 * account-linking CSRF that the old design allowed, where a state minted by one
 * account could be completed by a browser belonging to another. Proving it
 * fails needs two real users and a real unique index, which is why it lives
 * here rather than in the unit tests.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
} from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { default: accountApp } = await import('./index')
const { default: discordBouncerApp } = await import('../auth/discord')

const prisma = getTestPrisma()

// ─── helpers ─────────────────────────────────────────────────────────────────

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

/** Queues the token exchange then the /users/@me lookup. */
function mockDiscordHappyPath(discordId = DISCORD_ID) {
  mockFetch
    .mockResolvedValueOnce(res(200, { access_token: 'discord-token' }))
    .mockResolvedValueOnce(res(200, { id: discordId }))
}

/** Mints a real signed state by calling the authenticated connect route. */
async function mintState(userId: string): Promise<string> {
  const response = await buildApp(accountApp, { userId }).request(
    '/me/connect-discord',
    { method: 'POST' }
  )
  const body = (await response.json()) as { data: { url: string } }
  return new URL(body.data.url).searchParams.get('state')!
}

/**
 * Puts a state through the public bouncer the way Discord's redirect does, and
 * returns the code/state it forwarded to the frontend.
 *
 * The bouncer no longer decides anything, so this only models the hop — but
 * routing through it keeps the test honest about where the values come from.
 */
async function bounce(state: string) {
  const response = await discordBouncerApp.request(
    `/discord/callback?code=auth-code&state=${encodeURIComponent(state)}`
  )
  const location = new URL(response.headers.get('location')!)
  return {
    code: location.searchParams.get('code')!,
    state: location.searchParams.get('state')!,
  }
}

/**
 * Redeems a forwarded (code, state) pair as `userId`.
 *
 * `userId` is the authenticated caller — the parameter that makes the CSRF
 * test expressible, since the attack is precisely a state whose user and a
 * caller's identity disagree.
 */
async function complete(
  userId: string,
  forwarded: { code: string; state: string }
) {
  const response = await buildApp(accountApp, { userId }).request(
    '/me/connect-discord/complete',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forwarded),
    }
  )
  const body = (await response.json()) as { reason?: string }
  return { status: response.status, reason: body.reason }
}

/** The full happy round trip for one user: mint → bounce → redeem. */
async function link(userId: string) {
  return complete(userId, await bounce(await mintState(userId)))
}

/** discordId as currently stored. */
async function storedDiscordId(userId: string) {
  const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  return row.discordId
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockFetch.mockReset()
  await truncateAll(prisma)
  vi.stubEnv('DISCORD_CLIENT_ID', 'client-id')
  vi.stubEnv('DISCORD_CLIENT_SECRET', 'client-secret')
  vi.stubEnv('DISCORD_STATE_SECRET', 'state-secret')
  vi.stubEnv('DISCORD_REDIRECT_URI', 'https://api.test/auth/discord/callback')
  vi.stubEnv('FRONTEND_URL', FRONTEND)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── the round trip ──────────────────────────────────────────────────────────

describe('connecting Discord', () => {
  it('links the account to the user who redeemed the state', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    mockDiscordHappyPath()

    const result = await link(user.id)

    expect(result.status).toBe(200)
    expect(await storedDiscordId(user.id)).toBe(DISCORD_ID)
    expect(await storedDiscordId(other.id)).toBeNull()
  })

  it('refuses a Discord account already linked elsewhere', async () => {
    // discordId is unique — the P2002 the handler translates is real.
    const first = await seedUser(prisma)
    mockDiscordHappyPath()
    await link(first.id)

    const second = await seedUser(prisma)
    mockDiscordHappyPath()
    const result = await link(second.id)

    expect(result.status).toBe(409)
    expect(result.reason).toBe('already_linked_elsewhere')
    expect(await storedDiscordId(second.id)).toBeNull()
  })

  it('lets the same user re-link the same Discord account', async () => {
    const user = await seedUser(prisma)
    mockDiscordHappyPath()
    await link(user.id)

    mockDiscordHappyPath()
    const result = await link(user.id)

    expect(result.status).toBe(200)
  })

  it('rejects a forged state without writing anything', async () => {
    const user = await seedUser(prisma)
    const state = await mintState(user.id)
    const [nonce, , exp, sig] = state.split('.')
    const forged = `${nonce}.${user.id}-forged.${exp}.${sig}`

    const result = await complete(user.id, await bounce(forged))

    expect(result.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('writes nothing when the Discord token exchange fails', async () => {
    const user = await seedUser(prisma)
    mockFetch.mockResolvedValueOnce(res(400, { error: 'invalid_grant' }))

    const result = await link(user.id)

    expect(result.status).toBe(502)
    expect(result.reason).toBe('exchange_failed')
    expect(await storedDiscordId(user.id)).toBeNull()
  })
})

// ─── account-linking CSRF ────────────────────────────────────────────────────

describe('redeeming a state minted by a different account', () => {
  it('refuses, and links the Discord account to nobody', async () => {
    // The attack, end to end. The attacker starts a link for their own
    // account and hands the authorize URL to the victim; the victim approves
    // on Discord, so it is the VICTIM's browser that receives the code and
    // redeems it — carrying the victim's identity and the attacker's state.
    //
    // Under the old design the callback trusted the state alone and wrote the
    // victim's Discord id onto the attacker's row.
    const attacker = await seedUser(prisma)
    const victim = await seedUser(prisma)
    mockDiscordHappyPath()

    const attackersState = await bounce(await mintState(attacker.id))
    const result = await complete(victim.id, attackersState)

    expect(result.status).toBe(403)
    expect(result.reason).toBe('state_mismatch')
    expect(await storedDiscordId(attacker.id)).toBeNull()
    expect(await storedDiscordId(victim.id)).toBeNull()
  })

  it('never spends the code, so nothing is learned about the victim', async () => {
    const attacker = await seedUser(prisma)
    const victim = await seedUser(prisma)
    mockDiscordHappyPath()

    await complete(victim.id, await bounce(await mintState(attacker.id)))

    // Refusing before the exchange is what keeps the victim's Discord identity
    // out of the attacker's reach entirely — we never even resolve it.
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not leave the victim unable to link their own account later', async () => {
    // The squatting half of the original impact: because discordId is unique,
    // a successful attack would have permanently blocked the victim from ever
    // linking their own Discord.
    const attacker = await seedUser(prisma)
    const victim = await seedUser(prisma)
    mockDiscordHappyPath()
    await complete(victim.id, await bounce(await mintState(attacker.id)))

    mockFetch.mockReset()
    mockDiscordHappyPath()
    const result = await link(victim.id)

    expect(result.status).toBe(200)
    expect(await storedDiscordId(victim.id)).toBe(DISCORD_ID)
  })
})

// ─── disconnecting ───────────────────────────────────────────────────────────

describe('DELETE /me/connect-discord', () => {
  it('clears the link', async () => {
    const user = await seedUser(prisma)
    mockDiscordHappyPath()
    await link(user.id)

    const response = await buildApp(accountApp, { userId: user.id }).request(
      '/me/connect-discord',
      { method: 'DELETE' }
    )

    expect(response.status).toBe(200)
    expect(await storedDiscordId(user.id)).toBeNull()
  })

  it('frees the Discord account for another user', async () => {
    // Clearing the column must release the unique constraint.
    const first = await seedUser(prisma)
    mockDiscordHappyPath()
    await link(first.id)
    await buildApp(accountApp, { userId: first.id }).request(
      '/me/connect-discord',
      { method: 'DELETE' }
    )

    const second = await seedUser(prisma)
    mockDiscordHappyPath()
    const result = await link(second.id)

    expect(result.status).toBe(200)
  })

  it('is a no-op when nothing was linked', async () => {
    const user = await seedUser(prisma)

    const response = await buildApp(accountApp, { userId: user.id }).request(
      '/me/connect-discord',
      { method: 'DELETE' }
    )

    expect(response.status).toBe(200)
  })
})
