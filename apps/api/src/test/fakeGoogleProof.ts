// A stand-in for aws-jwt-verify in integration tests, so Google
// re-confirmations can be minted without a real Cognito pool.
//
//   vi.mock('aws-jwt-verify', async () =>
//     (await import('../../test/fakeGoogleProof')).fakeJwtVerifyModule())
//
//   const googleProof = fakeGoogleProof({ sub: 'sub-google' })
//
// A fake proof is JSON describing the payload; the fake verifier parses it, or
// rejects anything that isn't one — standing in for a bad signature.

/** Builds a fake Google re-confirmation token. */
export function fakeGoogleProof(options: {
  sub: string
  email?: string
  /** How long ago the Google sign-in happened. Defaults to 10 seconds. */
  ageSeconds?: number
  provider?: string
}): string {
  return JSON.stringify({
    fake: true,
    sub: options.sub,
    email: options.email ?? `${options.sub}@gmail.test`,
    auth_time: Math.floor(Date.now() / 1000) - (options.ageSeconds ?? 10),
    identities: [{ providerName: options.provider ?? 'Google' }],
  })
}

/** The mocked `aws-jwt-verify` module. */
export function fakeJwtVerifyModule() {
  return {
    CognitoJwtVerifier: {
      create: () => ({
        verify: async (token: string) => {
          const payload: unknown = JSON.parse(token)
          if (
            !payload ||
            typeof payload !== 'object' ||
            !(payload as { fake?: unknown }).fake
          ) {
            throw new Error('Invalid signature')
          }
          return payload
        },
      }),
    },
  }
}
