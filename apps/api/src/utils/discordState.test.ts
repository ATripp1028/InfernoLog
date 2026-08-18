/**
 * Unit tests for the signed Discord OAuth `state`.
 *
 * The state carries a userId across a redirect that cannot carry a JWT, and
 * these tests cover the one guarantee it makes: the userId inside cannot be
 * changed by anyone without the signing secret. Every forgery path must return
 * null, and the "return null, never throw, never explain why" contract has to
 * hold for malformed input too.
 *
 * What the state does NOT establish — that whoever presents it is that user —
 * is checked by POST /v1/me/connect-discord/complete instead, and is covered by
 * routes/account/discordComplete.test.ts. Real HMAC here; only the clock and
 * the secret are stubbed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'
import {
  mintConnectDiscordState,
  verifyConnectDiscordState,
} from './discordState'

const SECRET = 'discord-state-secret'
const USER_ID = '11111111-2222-3333-4444-555555555555'
const NONCE = 'nonce-abc'
const NOW_SECONDS = 1_760_000_000
const TTL_SECONDS = 10 * 60

/** Signs a body with an explicit secret, for forging test states. */
function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

/** Builds a state string with arbitrary parts, signed unless told otherwise. */
function stateOf(
  nonce: string,
  userId: string,
  exp: number | string,
  opts: { secret?: string } = {}
): string {
  const body = `${nonce}.${userId}.${exp}`
  return `${body}.${sign(body, opts.secret)}`
}

beforeEach(() => {
  vi.stubEnv('DISCORD_STATE_SECRET', SECRET)
  vi.useFakeTimers()
  vi.setSystemTime(NOW_SECONDS * 1000)
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── mintConnectDiscordState ─────────────────────────────────────────────────

describe('mintConnectDiscordState', () => {
  it('emits nonce.userId.exp.signature with a 10-minute expiry', () => {
    const state = mintConnectDiscordState(USER_ID, NONCE)
    const parts = state.split('.')

    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe(NONCE)
    expect(parts[1]).toBe(USER_ID)
    expect(Number(parts[2])).toBe(NOW_SECONDS + TTL_SECONDS)
    expect(parts[3]).toBe(
      sign(`${NONCE}.${USER_ID}.${NOW_SECONDS + TTL_SECONDS}`)
    )
  })

  it('binds the signature to the userId, not just the nonce', () => {
    const a = mintConnectDiscordState(USER_ID, NONCE)
    const b = mintConnectDiscordState('another-user', NONCE)
    expect(a.split('.')[3]).not.toBe(b.split('.')[3])
  })
})

// ─── round trip ──────────────────────────────────────────────────────────────

describe('verifyConnectDiscordState — happy path', () => {
  it('accepts a freshly minted state and returns its payload', () => {
    const state = mintConnectDiscordState(USER_ID, NONCE)

    expect(verifyConnectDiscordState(state)).toEqual({
      nonce: NONCE,
      userId: USER_ID,
      exp: NOW_SECONDS + TTL_SECONDS,
    })
  })

  it('still accepts a state one second before it expires', () => {
    const state = mintConnectDiscordState(USER_ID, NONCE)
    vi.setSystemTime((NOW_SECONDS + TTL_SECONDS - 1) * 1000)
    expect(verifyConnectDiscordState(state)).not.toBeNull()
  })

  it('accepts a state at the exact expiry second', () => {
    // The check is `exp < now`, so equality is still valid.
    const state = mintConnectDiscordState(USER_ID, NONCE)
    vi.setSystemTime((NOW_SECONDS + TTL_SECONDS) * 1000)
    expect(verifyConnectDiscordState(state)).not.toBeNull()
  })
})

// ─── forgery and tampering ───────────────────────────────────────────────────

describe('verifyConnectDiscordState — rejects tampering', () => {
  it('rejects a swapped userId, the attack this signature exists to stop', () => {
    // Re-pointing a valid state at another account must not verify.
    const state = mintConnectDiscordState(USER_ID, NONCE)
    const [nonce, , exp, sig] = state.split('.')
    const forged = `${nonce}.victim-user-id.${exp}.${sig}`

    expect(verifyConnectDiscordState(forged)).toBeNull()
  })

  it('rejects a tampered nonce', () => {
    const state = mintConnectDiscordState(USER_ID, NONCE)
    const [, userId, exp, sig] = state.split('.')
    expect(
      verifyConnectDiscordState(`other-nonce.${userId}.${exp}.${sig}`)
    ).toBeNull()
  })

  it('rejects an extended expiry', () => {
    const state = mintConnectDiscordState(USER_ID, NONCE)
    const [nonce, userId, , sig] = state.split('.')
    const forged = `${nonce}.${userId}.${NOW_SECONDS + 999_999}.${sig}`

    expect(verifyConnectDiscordState(forged)).toBeNull()
  })

  it('rejects a state signed with a different secret', () => {
    const forged = stateOf(NONCE, USER_ID, NOW_SECONDS + TTL_SECONDS, {
      secret: 'attacker-secret',
    })
    expect(verifyConnectDiscordState(forged)).toBeNull()
  })

  it('rejects a garbage signature', () => {
    const state = mintConnectDiscordState(USER_ID, NONCE)
    const [nonce, userId, exp] = state.split('.')
    expect(
      verifyConnectDiscordState(`${nonce}.${userId}.${exp}.deadbeef`)
    ).toBeNull()
  })
})

// ─── expiry and malformed input ──────────────────────────────────────────────

describe('verifyConnectDiscordState — rejects expired and malformed states', () => {
  it('rejects a state one second past expiry', () => {
    const state = mintConnectDiscordState(USER_ID, NONCE)
    vi.setSystemTime((NOW_SECONDS + TTL_SECONDS + 1) * 1000)
    expect(verifyConnectDiscordState(state)).toBeNull()
  })

  it('rejects a correctly-signed but non-numeric expiry', () => {
    // Signed properly, so this gets past the HMAC check and must be caught by
    // the Number.isFinite guard rather than sailing through as NaN.
    const forged = stateOf(NONCE, USER_ID, 'not-a-number')
    expect(verifyConnectDiscordState(forged)).toBeNull()
  })

  it.each([
    ['an empty string', ''],
    ['too few parts', 'a.b.c'],
    ['too many parts', 'a.b.c.d.e'],
    ['a single token', 'nonsense'],
    ['only separators', '...'],
  ])('rejects %s', (_label, input) => {
    expect(verifyConnectDiscordState(input)).toBeNull()
  })

  it('never throws on malformed input', () => {
    for (const input of ['', '...', 'a.b.c.d.e', ' . . . '])
      expect(() => verifyConnectDiscordState(input)).not.toThrow()
  })
})
