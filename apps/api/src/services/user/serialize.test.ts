/**
 * Unit tests for the `me` payload's identities.
 *
 * serializeMe is the boundary between identity rows and the wire, so the
 * properties that matter are what it withholds — no identity's Cognito sub is
 * ever sent — and that the deprecated `discordId` field is derived from the
 * identities rather than read from anywhere else.
 */

import { describe, expect, it } from 'vitest'
import { serializeIdentity, serializeMe, type RawIdentity } from './serialize'

// ─── helpers ─────────────────────────────────────────────────────────────────

function identity(overrides: Partial<RawIdentity> = {}): RawIdentity {
  return {
    id: 'identity-1',
    provider: 'GOOGLE',
    cognitoSub: 'google-sub',
    providerAccountId: null,
    email: 'player@example.com',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  }
}

function me(authIdentities: RawIdentity[]) {
  return serializeMe({ id: 'user-1', enjoymentWeight: 0, authIdentities })
}

// ─── serializeIdentity ───────────────────────────────────────────────────────

describe('serializeIdentity', () => {
  it('never puts the Cognito sub on the wire', () => {
    const wire = serializeIdentity(identity())

    expect(wire).not.toHaveProperty('cognitoSub')
    expect(JSON.stringify(wire)).not.toContain('google-sub')
  })

  it('can sign in when the identity has a Cognito user', () => {
    expect(serializeIdentity(identity()).canSignIn).toBe(true)
  })

  it('cannot sign in with a linked Discord account', () => {
    const discord = identity({
      provider: 'DISCORD',
      cognitoSub: null,
      providerAccountId: '987654321',
      email: null,
    })

    expect(serializeIdentity(discord)).toEqual({
      id: 'identity-1',
      provider: 'DISCORD',
      providerAccountId: '987654321',
      email: null,
      canSignIn: false,
      createdAt: '2026-09-01T00:00:00.000Z',
    })
  })
})

// ─── serializeMe ─────────────────────────────────────────────────────────────

describe('serializeMe — identities', () => {
  it('sends every identity, in the order selected, as `identities`', () => {
    const payload = me([
      identity({ id: 'a' }),
      identity({ id: 'b', provider: 'DISCORD', cognitoSub: null }),
    ])

    expect(payload.identities.map((i) => i.id)).toEqual(['a', 'b'])
    expect(payload).not.toHaveProperty('authIdentities')
  })

  it('derives the deprecated discordId from the DISCORD identity', () => {
    const payload = me([
      identity(),
      identity({
        id: 'd',
        provider: 'DISCORD',
        cognitoSub: null,
        providerAccountId: '987654321',
      }),
    ])

    expect(payload.discordId).toBe('987654321')
  })

  it('sends a null discordId and no identities for a row without them', () => {
    const payload = serializeMe({ id: 'user-1', enjoymentWeight: 0 })

    expect(payload.identities).toEqual([])
    expect(payload.discordId).toBeNull()
  })
})
