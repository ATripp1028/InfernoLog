/**
 * Integration tests for connecting and disconnecting Discord.
 *
 * `User.discordId` is unique, so "already linked to another user" is a real
 * constraint. The connect route only mints a signed state URL, but the callback
 * that consumes it writes the id — the two are tested together here because the
 * property worth proving is the round trip: the state minted for one user must
 * link the Discord account to THAT user and nobody else.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp, getTestPrisma, truncateAll, seedUser } from '../../test/utils'

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
const { default: discordCallbackApp } = await import('../auth/discord')

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

/** Drives the public callback with a state, returning its redirect reason. */
async function callback(state: string) {
  const response = await discordCallbackApp.request(
    `/discord/callback?code=auth-code&state=${encodeURIComponent(state)}`
  )
  const location = new URL(response.headers.get('location')!)
  return {
    status: response.status,
    discord: location.searchParams.get('discord'),
    reason: location.searchParams.get('reason'),
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockFetch.mockReset()
  await truncateAll(prisma)
  vi.stubEnv('DISCORD_CLIENT_ID', 'client-id')
  vi.stubEnv('DISCORD_CLIENT_SECRET', 'client-secret')
  vi.stubEnv('DISCORD_REDIRECT_URI', 'https://api.test/auth/discord/callback')
  vi.stubEnv('FRONTEND_URL', FRONTEND)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── the round trip ──────────────────────────────────────────────────────────

describe('connecting Discord', () => {
  it('links the account to the user whose state was minted', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    const state = await mintState(user.id)
    mockDiscordHappyPath()

    const result = await callback(state)

    expect(result.discord).toBe('connected')
    const linked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(linked.discordId).toBe(DISCORD_ID)
    const untouched = await prisma.user.findUniqueOrThrow({
      where: { id: other.id },
    })
    expect(untouched.discordId).toBeNull()
  })

  it('refuses a Discord account already linked elsewhere', async () => {
    // discordId is unique — the P2002 the handler translates is real.
    const first = await seedUser(prisma)
    mockDiscordHappyPath()
    await callback(await mintState(first.id))

    const second = await seedUser(prisma)
    mockDiscordHappyPath()
    const result = await callback(await mintState(second.id))

    expect(result.reason).toBe('already_linked_elsewhere')
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: second.id } })
    expect(stored.discordId).toBeNull()
  })

  it('lets the same user re-link the same Discord account', async () => {
    const user = await seedUser(prisma)
    mockDiscordHappyPath()
    await callback(await mintState(user.id))

    mockDiscordHappyPath()
    const result = await callback(await mintState(user.id))

    expect(result.discord).toBe('connected')
  })

  it('rejects a forged state without writing anything', async () => {
    const user = await seedUser(prisma)
    const state = await mintState(user.id)
    const [nonce, , exp, sig] = state.split('.')

    const result = await callback(`${nonce}.${user.id}-forged.${exp}.${sig}`)

    expect(result.reason).toBe('invalid_state')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('writes nothing when the Discord token exchange fails', async () => {
    const user = await seedUser(prisma)
    mockFetch.mockResolvedValueOnce(res(400, { error: 'invalid_grant' }))

    const result = await callback(await mintState(user.id))

    expect(result.reason).toBe('token_exchange_failed')
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored.discordId).toBeNull()
  })
})

// ─── disconnecting ───────────────────────────────────────────────────────────

describe('DELETE /me/connect-discord', () => {
  it('clears the link', async () => {
    const user = await seedUser(prisma)
    mockDiscordHappyPath()
    await callback(await mintState(user.id))

    const response = await buildApp(accountApp, { userId: user.id }).request(
      '/me/connect-discord',
      { method: 'DELETE' }
    )

    expect(response.status).toBe(200)
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored.discordId).toBeNull()
  })

  it('frees the Discord account for another user', async () => {
    // Clearing the column must release the unique constraint.
    const first = await seedUser(prisma)
    mockDiscordHappyPath()
    await callback(await mintState(first.id))
    await buildApp(accountApp, { userId: first.id }).request(
      '/me/connect-discord',
      { method: 'DELETE' }
    )

    const second = await seedUser(prisma)
    mockDiscordHappyPath()
    const result = await callback(await mintState(second.id))

    expect(result.discord).toBe('connected')
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
