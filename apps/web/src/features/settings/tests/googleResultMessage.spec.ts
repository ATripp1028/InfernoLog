import { describe, expect, it } from 'vitest'
import { googleErrorMessage } from '../googleResultMessage'

describe('googleErrorMessage', () => {
  it.each([
    ['cancelled', /cancelled/],
    ['invalid-state', /expired/],
    ['exchange-failed', /Couldn’t confirm/],
    ['CONNECTED_ELSEWHERE', /different InfernoLog account/],
    ['ALREADY_CONNECTED', /already connected/],
    ['REAUTH_REQUIRED', /took too long/],
    [undefined, /Something went wrong/],
  ])('explains %s', (reason, message) => {
    expect(googleErrorMessage(reason)).toMatch(message)
  })
})
