/**
 * Integration tests for the account routes.
 *
 * The unit tests for these already assert the query SHAPES against a mocked
 * Prisma. What only a real database proves is that those queries do what they
 * intend: that the username uniqueness check is genuinely case-insensitive in
 * Postgres, and — the reason this file exists — that DELETE /me actually clears
 * every table. That handler relies on FK cascades for most of the account and
 * explicit deletes for the four relations that are ON DELETE RESTRICT; a
 * mocked test can only prove the calls were issued, not that nothing survives.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
} from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { mockCognitoSend } = vi.hoisted(() => ({
  mockCognitoSend: vi.fn(async () => ({})),
}))
vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  class UserNotFoundException extends Error {}
  return {
    CognitoIdentityProviderClient: class {
      send = mockCognitoSend
    },
    AdminDeleteUserCommand: class {
      constructor(public input: unknown) {}
    },
    UserNotFoundException,
  }
})

const { default: accountApp } = await import('./index')

const prisma = getTestPrisma()

// ─── helpers ─────────────────────────────────────────────────────────────────

function send(userId: string, method: string, path: string, body?: unknown) {
  return buildApp(accountApp, { userId }).request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── GET /me ─────────────────────────────────────────────────────────────────

describe('GET /me', () => {
  it('returns the stored user with its rating categories', async () => {
    const user = await seedUser(prisma)
    await prisma.ratingCategory.create({
      data: { userId: user.id, name: 'Gameplay', weight: 1, sortOrder: 0 },
    })

    const res = await send(user.id, 'GET', '/me')
    const body = (await res.json()) as {
      data: { id: string; ratingCategories: { name: string; weight: number }[] }
    }

    expect(res.status).toBe(200)
    expect(body.data.id).toBe(user.id)
    expect(body.data.ratingCategories).toEqual([
      { id: expect.any(String), name: 'Gameplay', weight: 1, sortOrder: 0 },
    ])
  })

  it('never returns the stored GDDL ciphertext', async () => {
    // serializeMe is the single boundary that strips it; this proves the real
    // select still routes through it.
    const user = await seedUser(prisma, { gddlApiKeyEncrypted: 'ciphertext' })

    const res = await send(user.id, 'GET', '/me')
    const text = await res.text()

    expect(text).not.toContain('ciphertext')
    expect(JSON.parse(text).data.hasGddlApiKey).toBe(true)
  })

  it('404s for a user id with no row', async () => {
    const res = await send('11111111-2222-3333-4444-555555555555', 'GET', '/me')

    expect(res.status).toBe(404)
  })
})

// ─── PATCH /me ───────────────────────────────────────────────────────────────

describe('PATCH /me', () => {
  it('persists a partial update without disturbing other columns', async () => {
    const user = await seedUser(prisma)

    await send(user.id, 'PATCH', '/me', { profilePublic: false })

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(stored.profilePublic).toBe(false)
    expect(stored.username).toBe(user.username)
    expect(stored.discordPublic).toBe(true)
  })

  it('seeds the default categories on the first switch to WEIGHTED', async () => {
    const user = await seedUser(prisma)

    await send(user.id, 'PATCH', '/me', { ratingMode: 'WEIGHTED' })

    const cats = await prisma.ratingCategory.findMany({
      where: { userId: user.id },
      orderBy: { sortOrder: 'asc' },
    })
    expect(cats.map((c) => c.name)).toEqual(['Gameplay', 'Decoration', 'Song'])
  })

  it('does not duplicate the categories on a second switch', async () => {
    // skipDuplicates leans on @@unique([userId, name]) — a real constraint.
    const user = await seedUser(prisma)

    await send(user.id, 'PATCH', '/me', { ratingMode: 'WEIGHTED' })
    await send(user.id, 'PATCH', '/me', { ratingMode: 'SIMPLE' })
    await send(user.id, 'PATCH', '/me', { ratingMode: 'WEIGHTED' })

    expect(
      await prisma.ratingCategory.count({ where: { userId: user.id } })
    ).toBe(3)
  })

  it('stamps legalAcceptedAt for acceptLegal', async () => {
    const user = await seedUser(prisma)

    await send(user.id, 'PATCH', '/me', { acceptLegal: true })

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(stored.legalAcceptedAt).toBeInstanceOf(Date)
  })
})

// ─── PATCH /me/username ──────────────────────────────────────────────────────

describe('PATCH /me/username', () => {
  it('changes the name and records the previous one', async () => {
    const user = await seedUser(prisma, { username: 'oldName' })

    const res = await send(user.id, 'PATCH', '/me/username', {
      username: 'newName',
    })

    expect(res.status).toBe(200)
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(stored.username).toBe('newName')
    expect(stored.previousUsername).toBe('oldName')
    expect(stored.usernameChangedAt).toBeInstanceOf(Date)
  })

  it('rejects a name another user holds in different case', async () => {
    // The uniqueness check uses mode:'insensitive'; only Postgres can confirm
    // that actually matches across case.
    await seedUser(prisma, { username: 'TakenName' })
    const user = await seedUser(prisma, { username: 'mine' })

    const res = await send(user.id, 'PATCH', '/me/username', {
      username: 'takenname',
    })

    expect(res.status).toBe(409)
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(stored.username).toBe('mine')
  })

  it('enforces the 30-day cooldown against a stored timestamp', async () => {
    const user = await seedUser(prisma, { username: 'oldName' })
    await prisma.user.update({
      where: { id: user.id },
      data: { usernameChangedAt: new Date() },
    })

    const res = await send(user.id, 'PATCH', '/me/username', {
      username: 'newName',
    })

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ error: 'cooldown' })
  })

  it('lets a user re-submit the name they already have during the cooldown', async () => {
    const user = await seedUser(prisma, { username: 'sameName' })
    await prisma.user.update({
      where: { id: user.id },
      data: { usernameChangedAt: new Date() },
    })

    const res = await send(user.id, 'PATCH', '/me/username', {
      username: 'sameName',
    })

    expect(res.status).toBe(200)
  })
})

// ─── DELETE /me ──────────────────────────────────────────────────────────────

describe('DELETE /me', () => {
  const CONFIRMATION = { confirmation: 'Delete this account' }

  /**
   * A user with a row in every table the purge has to clear — the cascading
   * ones and the four ON DELETE RESTRICT relations deleted explicitly.
   */
  async function seedFullAccount() {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '100' })

    const category = await prisma.ratingCategory.create({
      data: { userId: user.id, name: 'Gameplay', weight: 1, sortOrder: 0 },
    })
    const lp = await prisma.levelProgress.create({
      data: { userId: user.id, levelId: '100', status: 'COMPLETED' },
    })
    await prisma.progressUpdate.create({
      data: { levelProgressId: lp.id, kind: 'COMPLETION' },
    })
    await prisma.ratingScore.create({
      data: { levelProgressId: lp.id, categoryId: category.id, score: 80 },
    })
    await prisma.classicDemonList.create({
      data: { userId: user.id, levelProgressId: lp.id, listIndex: 1 },
    })
    const collection = await prisma.collection.create({
      data: { userId: user.id, name: 'Favorites', type: 'FAVORITES' },
    })
    await prisma.collectionEntry.create({
      data: { collectionId: collection.id, levelId: '100', rankingIndex: 1 },
    })
    await prisma.logPreset.create({
      data: {
        userId: user.id,
        name: 'My View',
        color: 'blue',
        sorts: [],
        filters: {},
        columns: {},
        columnOrder: [],
      },
    })
    await prisma.importJob.create({
      data: { userId: user.id, status: 'completed', totalRows: 0 },
    })
    await prisma.gddlSyncJob.create({
      data: { userId: user.id, status: 'completed' },
    })
    // The ON DELETE RESTRICT relations — an audit-trail protection that would
    // block the delete outright if the handler stopped clearing them.
    await prisma.report.create({
      data: { reporterId: user.id, reportedUserId: other.id, reason: 'spam' },
    })
    await prisma.report.create({
      data: { reporterId: other.id, reportedUserId: user.id, reason: 'spam' },
    })
    await prisma.banAppeal.create({
      data: { userId: user.id, appealText: 'please' },
    })
    await prisma.moderationAction.create({
      data: {
        moderatorId: other.id,
        targetUserId: user.id,
        action: 'WARN',
        reason: 'test',
      },
    })

    return { user, other }
  }

  it('purges every table the account touches', async () => {
    const { user } = await seedFullAccount()

    const res = await send(user.id, 'DELETE', '/me', CONFIRMATION)

    expect(res.status).toBe(200)
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull()
    // Cascades.
    expect(
      await prisma.levelProgress.count({ where: { userId: user.id } })
    ).toBe(0)
    expect(await prisma.progressUpdate.count()).toBe(0)
    expect(await prisma.ratingScore.count()).toBe(0)
    expect(
      await prisma.classicDemonList.count({ where: { userId: user.id } })
    ).toBe(0)
    expect(await prisma.collection.count({ where: { userId: user.id } })).toBe(
      0
    )
    expect(await prisma.collectionEntry.count()).toBe(0)
    expect(
      await prisma.ratingCategory.count({ where: { userId: user.id } })
    ).toBe(0)
    expect(await prisma.logPreset.count({ where: { userId: user.id } })).toBe(0)
    expect(await prisma.importJob.count({ where: { userId: user.id } })).toBe(0)
    // Explicit deletes for the RESTRICT relations.
    expect(await prisma.gddlSyncJob.count({ where: { userId: user.id } })).toBe(
      0
    )
    expect(await prisma.banAppeal.count({ where: { userId: user.id } })).toBe(0)
    expect(await prisma.report.count()).toBe(0)
    expect(await prisma.moderationAction.count()).toBe(0)
  })

  it('leaves the other user and the shared level intact', async () => {
    // The purge is scoped to one account; a shared level is cache data.
    const { user, other } = await seedFullAccount()

    await send(user.id, 'DELETE', '/me', CONFIRMATION)

    expect(
      await prisma.user.findUnique({ where: { id: other.id } })
    ).not.toBeNull()
    expect(
      await prisma.level.findUnique({ where: { inGameId: '100' } })
    ).not.toBeNull()
  })

  it('refuses without the confirmation phrase and deletes nothing', async () => {
    const { user } = await seedFullAccount()

    const res = await send(user.id, 'DELETE', '/me', { confirmation: 'nope' })

    expect(res.status).toBe(400)
    expect(
      await prisma.user.findUnique({ where: { id: user.id } })
    ).not.toBeNull()
  })
})
