import { describe, expect, it } from 'vitest'
import type { AuthIdentity } from '@/lib/api/me'
import { discordIdentifier, signInMethodRows } from '../connectedAccounts'

// The Connected accounts list used to hard-code one Google row showing the
// account's email as "Primary login", whatever the account actually signed in
// with. These pin that the rows now come from the identities themselves.

function identity(overrides: Partial<AuthIdentity> = {}): AuthIdentity {
  return {
    id: 'google-1',
    provider: 'GOOGLE',
    providerAccountId: null,
    email: 'player@gmail.com',
    canSignIn: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

const discord = identity({
  id: 'discord-1',
  provider: 'DISCORD',
  providerAccountId: '987654321',
  email: null,
  canSignIn: false,
})

describe('signInMethodRows', () => {
  it('shows each identity that can sign in, named for its provider', () => {
    const rows = signInMethodRows([
      identity(),
      identity({ id: 'pw-1', provider: 'PASSWORD', email: 'e2e+x@test.dev' }),
    ])

    expect(rows).toEqual([
      {
        id: 'google-1',
        provider: 'GOOGLE',
        providerName: 'Google',
        identifier: 'player@gmail.com',
      },
      {
        id: 'pw-1',
        provider: 'PASSWORD',
        providerName: 'Email and password',
        identifier: 'e2e+x@test.dev',
      },
    ])
  })

  it('leaves out a linked account that cannot sign in', () => {
    expect(signInMethodRows([identity(), discord]).map((r) => r.id)).toEqual([
      'google-1',
    ])
  })

  it('shows no Google row for an account without a Google identity', () => {
    // The old list showed one regardless.
    const rows = signInMethodRows([
      identity({ id: 'pw-1', provider: 'PASSWORD' }),
    ])

    expect(rows.some((r) => r.provider === 'GOOGLE')).toBe(false)
  })
})

describe('discordIdentifier', () => {
  it('names the linked Discord account by its id', () => {
    expect(discordIdentifier([identity(), discord])).toBe(
      'Discord ID 987654321'
    )
  })

  it('is null when no Discord account is linked', () => {
    expect(discordIdentifier([identity()])).toBeNull()
  })
})
