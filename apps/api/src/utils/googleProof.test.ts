import { beforeEach, describe, expect, it, vi } from 'vitest'

const { verify, create } = vi.hoisted(() => {
  const verify = vi.fn()
  return { verify, create: vi.fn(() => ({ verify })) }
})
vi.mock('aws-jwt-verify', () => ({ CognitoJwtVerifier: { create } }))

const { GoogleProofError, PROOF_MAX_AGE_SECONDS, verifyGoogleProof } =
  await import('./googleProof')

const NOW_MS = 1_800_000_000_000
const nowSeconds = NOW_MS / 1000

function payload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'sub-google',
    email: 'Player@Example.com',
    auth_time: nowSeconds - 30,
    identities: [{ providerName: 'Google', userId: '123' }],
    ...overrides,
  }
}

beforeEach(() => {
  verify.mockReset()
  create.mockClear()
  vi.stubEnv('COGNITO_USER_POOL_ID', 'us-east-1_pool')
  vi.stubEnv('COGNITO_CLIENT_ID', 'web-client')
})

describe('verifyGoogleProof', () => {
  it('returns the Google identity for a fresh, valid token', async () => {
    verify.mockResolvedValue(payload())

    await expect(verifyGoogleProof('token', NOW_MS)).resolves.toEqual({
      cognitoSub: 'sub-google',
      email: 'player@example.com',
    })
    expect(create).toHaveBeenCalledWith({
      userPoolId: 'us-east-1_pool',
      tokenUse: 'id',
      clientId: 'web-client',
    })
  })

  it('reuses one verifier per pool and client', async () => {
    vi.stubEnv('COGNITO_USER_POOL_ID', 'us-east-1_other')
    verify.mockResolvedValue(payload())
    await verifyGoogleProof('a', NOW_MS)
    await verifyGoogleProof('b', NOW_MS)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a token that fails verification', null, 'invalid'],
    ['a native password user', { identities: undefined }, 'not-google'],
    [
      'another provider',
      { identities: [{ providerName: 'Facebook' }] },
      'not-google',
    ],
    [
      'a sign-in older than the limit',
      { auth_time: nowSeconds - PROOF_MAX_AGE_SECONDS - 1 },
      'stale',
    ],
    ['no auth_time', { auth_time: undefined }, 'stale'],
    ['no email', { email: '' }, 'no-email'],
  ])('refuses %s', async (_label, overrides, reason) => {
    if (overrides === null) verify.mockRejectedValue(new Error('bad signature'))
    else verify.mockResolvedValue(payload(overrides))

    const error = await verifyGoogleProof('token', NOW_MS).catch((e) => e)
    expect(error).toBeInstanceOf(GoogleProofError)
    expect(error).toMatchObject({ reason })
    expect(String(error)).not.toContain('token')
  })

  it('accepts a sign-in exactly at the limit', async () => {
    verify.mockResolvedValue(
      payload({ auth_time: nowSeconds - PROOF_MAX_AGE_SECONDS })
    )
    await expect(verifyGoogleProof('token', NOW_MS)).resolves.toBeDefined()
  })

  it('needs the pool and client configured', async () => {
    vi.stubEnv('COGNITO_CLIENT_ID', '')
    await expect(verifyGoogleProof('token', NOW_MS)).rejects.toThrow(
      'must be set'
    )
  })
})
