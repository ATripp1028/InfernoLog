/**
 * Integration tests for storing the GDDL API key.
 *
 * `User.gddlUsername` is unique, so "that GDDL account is already connected to
 * a different InfernoLog user" is a real database constraint rather than a
 * pre-check — the handler maps P2002 to a 409, and only Postgres can raise it.
 * The other thing worth proving against real rows is that the stored value is
 * the ciphertext and that no response ever carries it.
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
vi.mock('../../utils/kms', () => ({
  encryptSecret: vi.fn(async (plaintext: string) => `enc(${plaintext})`),
  decryptSecret: vi.fn(async () => 'plaintext-key'),
}))

const { mockVerifyKey } = vi.hoisted(() => ({
  mockVerifyKey: vi.fn(async () => ({ name: 'GDDLUser' })),
}))
vi.mock('../../utils/gddl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/gddl')>()),
  verifyGddlApiKey: mockVerifyKey,
}))

const { default: accountApp } = await import('./index')

const prisma = getTestPrisma()

// ─── helpers ─────────────────────────────────────────────────────────────────

function send(userId: string, method: string, body?: unknown) {
  return buildApp(accountApp, { userId }).request('/me/gddl-key', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

const SECRET = 'super-secret-api-key'

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
  mockVerifyKey.mockResolvedValue({ name: 'GDDLUser' })
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── storing ─────────────────────────────────────────────────────────────────

describe('PUT /me/gddl-key', () => {
  it('stores the ciphertext and the confirmed GDDL name', async () => {
    const user = await seedUser(prisma)

    const res = await send(user.id, 'PUT', { apiKey: SECRET })

    expect(res.status).toBe(200)
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(stored.gddlApiKeyEncrypted).toBe(`enc(${SECRET})`)
    expect(stored.gddlUsername).toBe('GDDLUser')
  })

  it('never returns the key or its ciphertext', async () => {
    const user = await seedUser(prisma)

    const text = await (await send(user.id, 'PUT', { apiKey: SECRET })).text()

    expect(text).not.toContain(SECRET)
    expect(text).not.toContain('enc(')
    expect(JSON.parse(text).data.hasGddlApiKey).toBe(true)
  })

  it('replaces a previously stored key', async () => {
    const user = await seedUser(prisma, { gddlApiKeyEncrypted: 'enc(old-key)' })

    await send(user.id, 'PUT', { apiKey: SECRET })

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(stored.gddlApiKeyEncrypted).toBe(`enc(${SECRET})`)
  })

  it('409s when the GDDL account is already linked to another user', async () => {
    // gddlUsername is unique — this is the constraint firing, not a pre-check.
    const first = await seedUser(prisma)
    await send(first.id, 'PUT', { apiKey: SECRET })
    const second = await seedUser(prisma)

    const res = await send(second.id, 'PUT', { apiKey: 'another-key' })

    expect(res.status).toBe(409)
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: second.id },
    })
    expect(stored.gddlApiKeyEncrypted).toBeNull()
  })

  it('stores nothing when GDDL rejects the key', async () => {
    const { GddlInvalidKeyError } = await import('../../utils/gddl')
    mockVerifyKey.mockRejectedValue(new GddlInvalidKeyError())
    const user = await seedUser(prisma)

    const res = await send(user.id, 'PUT', { apiKey: 'bad-key' })

    expect(res.status).toBeGreaterThanOrEqual(400)
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(stored.gddlApiKeyEncrypted).toBeNull()
  })

  it('400s on an invalid body without verifying or storing', async () => {
    const user = await seedUser(prisma)

    const res = await send(user.id, 'PUT', { apiKey: '' })

    expect(res.status).toBe(400)
    expect(mockVerifyKey).not.toHaveBeenCalled()
  })
})

// ─── removing ────────────────────────────────────────────────────────────────

describe('DELETE /me/gddl-key', () => {
  it('clears both the ciphertext and the GDDL name', async () => {
    const user = await seedUser(prisma)
    await send(user.id, 'PUT', { apiKey: SECRET })

    const res = await send(user.id, 'DELETE')

    expect(res.status).toBe(200)
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(stored.gddlApiKeyEncrypted).toBeNull()
    expect(stored.gddlUsername).toBeNull()
  })

  it('frees the GDDL account for another user to connect', async () => {
    // Clearing gddlUsername has to actually release the unique constraint.
    const first = await seedUser(prisma)
    await send(first.id, 'PUT', { apiKey: SECRET })
    await send(first.id, 'DELETE')

    const second = await seedUser(prisma)
    const res = await send(second.id, 'PUT', { apiKey: SECRET })

    expect(res.status).toBe(200)
  })

  it('is a no-op when no key was stored', async () => {
    const user = await seedUser(prisma)

    const res = await send(user.id, 'DELETE')

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { hasGddlApiKey: boolean } }
    expect(body.data.hasGddlApiKey).toBe(false)
  })
})
