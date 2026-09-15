import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GoogleProofFlowError,
  PROOF_TTL_MS,
  buildGoogleProofUrl,
  clearGoogleProof,
  completeGoogleProof,
  peekGoogleProof,
  storeGoogleProof,
} from '../googleProof'

const fetchMock = vi.fn()

beforeEach(() => {
  sessionStorage.clear()
  vi.stubEnv('VITE_COGNITO_DOMAIN', 'auth.infernolog.test')
  vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'web-client')
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function startedFlow() {
  const url = new URL(await buildGoogleProofUrl('connect-google'))
  return { url, state: url.searchParams.get('state') ?? '' }
}

describe('buildGoogleProofUrl', () => {
  it('asks the hosted UI for Google with PKCE, returning to the proof callback', async () => {
    const { url } = await startedFlow()

    expect(url.origin).toBe('https://auth.infernolog.test')
    expect(url.pathname).toBe('/oauth2/authorize')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      identity_provider: 'Google',
      response_type: 'code',
      client_id: 'web-client',
      redirect_uri: `${window.location.origin}/auth/google-proof`,
      code_challenge_method: 'S256',
    })
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/)
  })
})

describe('completeGoogleProof', () => {
  it('exchanges the code with the verifier, revokes the refresh token, and returns the ID token', async () => {
    const { state } = await startedFlow()
    fetchMock.mockImplementation(async (input: string) =>
      input.endsWith('/oauth2/token')
        ? new Response(
            JSON.stringify({ id_token: 'id-token', refresh_token: 'refresh' }),
            { status: 200 }
          )
        : new Response(null, { status: 200 })
    )

    const result = await completeGoogleProof(
      new URLSearchParams({ code: 'the-code', state })
    )

    expect(result).toEqual({ purpose: 'connect-google', idToken: 'id-token' })
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(tokenUrl).toBe('https://auth.infernolog.test/oauth2/token')
    const body = new URLSearchParams(String(tokenInit.body))
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('the-code')
    expect(body.get('code_verifier')).toMatch(/^[\w-]{43}$/)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://auth.infernolog.test/oauth2/revoke'
    )
  })

  it('is single use: a replayed callback finds nothing pending', async () => {
    const { state } = await startedFlow()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id_token: 'id-token' }), { status: 200 })
    )
    const params = new URLSearchParams({ code: 'c', state })
    await completeGoogleProof(params)

    await expect(completeGoogleProof(params)).rejects.toMatchObject({
      reason: 'invalid-state',
    })
  })

  it.each([
    ['the user backed out', { error: 'access_denied' }, 'cancelled'],
    [
      'the state does not match',
      { code: 'c', state: 'forged' },
      'invalid-state',
    ],
    ['there is no code', { state: 'x' }, 'invalid-state'],
  ])('refuses when %s', async (_label, search, reason) => {
    await startedFlow()
    const error = await completeGoogleProof(
      new URLSearchParams(search as Record<string, string>)
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GoogleProofFlowError)
    expect(error).toMatchObject({ reason })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a failed exchange', async () => {
    const { state } = await startedFlow()
    fetchMock.mockResolvedValue(new Response('{}', { status: 400 }))
    await expect(
      completeGoogleProof(new URLSearchParams({ code: 'c', state }))
    ).rejects.toMatchObject({ reason: 'exchange-failed' })

    const again = await startedFlow()
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(
      completeGoogleProof(
        new URLSearchParams({ code: 'c', state: again.state })
      )
    ).rejects.toMatchObject({ reason: 'exchange-failed' })
  })
})

describe('stored proofs', () => {
  it('offers a fresh proof for its purpose only, until cleared', () => {
    storeGoogleProof('password-setup', 'id-token')
    expect(peekGoogleProof('connect-google')).toBeNull()
    expect(peekGoogleProof('password-setup')).toBe('id-token')
    clearGoogleProof()
    expect(peekGoogleProof('password-setup')).toBeNull()
  })

  it('drops a proof older than its time limit', () => {
    storeGoogleProof('password-setup', 'id-token')
    expect(
      peekGoogleProof('password-setup', Date.now() + PROOF_TTL_MS + 1)
    ).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('drops a corrupt record', () => {
    sessionStorage.setItem('il_google_proof', '{nope')
    expect(peekGoogleProof('password-setup')).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })
})
