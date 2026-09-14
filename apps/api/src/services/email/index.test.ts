/**
 * Unit tests for outgoing email: what reaches SES, what the templates say, and
 * that a failed send leaks no verification code into logs or Sentry.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteEnv } from '../../middleware/errors'

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))

vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: class {
    send = mockSend
  },
  SendEmailCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
}))
vi.mock('../../utils/logger', async () => {
  const { leakCapture } = await import('../../test/captureLeaks')
  return { logger: leakCapture.logger }
})
vi.mock('@sentry/node', async () => {
  const { leakCapture } = await import('../../test/captureLeaks')
  return leakCapture.sentry
})

const {
  sendEmail,
  verificationCodeEmail,
  existingAccountEmail,
  emailChangedEmail,
} = await import('./index')
const { Sensitive } = await import('../../utils/sensitive')
const { leakCapture } = await import('../../test/captureLeaks')
const { createErrorHandler } = await import('../../middleware/errors')
const { Hono } = await import('hono')

const CODE = '482913'

beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({})
  leakCapture.reset()
  vi.stubEnv('EMAIL_FROM', 'InfernoLog <no-reply@infernolog.com>')
  vi.stubEnv(
    'SES_IDENTITY_ARN',
    'arn:aws:ses:us-east-1:000000000000:identity/infernolog.com'
  )
  vi.stubEnv('EMAIL_REPLY_TO', '')
})

function sentInput() {
  return mockSend.mock.calls[0]?.[0].input as {
    FromEmailAddress: string
    FromEmailAddressIdentityArn: string
    Destination: { ToAddresses: string[] }
    ReplyToAddresses?: string[]
    Content: {
      Simple: {
        Subject: { Data: string }
        Body: { Text: { Data: string }; Html: { Data: string } }
      }
    }
  }
}

describe('sendEmail', () => {
  it('sends from the configured identity to one recipient', async () => {
    await sendEmail('player@example.com', emailChangedEmail())
    const input = sentInput()
    expect(input.FromEmailAddress).toBe('InfernoLog <no-reply@infernolog.com>')
    expect(input.FromEmailAddressIdentityArn).toContain(
      'identity/infernolog.com'
    )
    expect(input.Destination.ToAddresses).toEqual(['player@example.com'])
    expect(input.ReplyToAddresses).toBeUndefined()
  })

  it('sets Reply-To when one is configured', async () => {
    vi.stubEnv('EMAIL_REPLY_TO', 'support@infernolog.com')
    await sendEmail('player@example.com', emailChangedEmail())
    expect(sentInput().ReplyToAddresses).toEqual(['support@infernolog.com'])
  })

  it('refuses to send without its configuration', async () => {
    vi.stubEnv('SES_IDENTITY_ARN', '')
    await expect(
      sendEmail('player@example.com', emailChangedEmail())
    ).rejects.toThrow('Email is not configured')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('a failed send of a code reaches the error handler without leaking the code', async () => {
    mockSend.mockRejectedValue(new Error('MessageRejected: throttled'))
    const app = new Hono<RouteEnv>()
    app.onError(createErrorHandler('EmailLeakTest'))
    app.post('/send', async (c) => {
      await sendEmail(
        'player@example.com',
        verificationCodeEmail('SIGNUP', new Sensitive(CODE))
      )
      return c.json({ ok: true })
    })

    const res = await app.request('/send', { method: 'POST' })
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain(CODE)
    expect(leakCapture.sentryCalls()).toHaveLength(1)
    leakCapture.expectNoLeak(CODE)
  })
})

describe('templates', () => {
  it('puts the code in the body and never the subject', () => {
    const email = verificationCodeEmail('SIGNUP', new Sensitive(CODE))
    expect(email.subject).not.toContain(CODE)
    expect(email.text).toContain(CODE)
    expect(email.html).toContain(CODE)
    expect(email.text).toContain('15 minutes')
  })

  it('words the first line for each purpose', () => {
    const code = new Sensitive(CODE)
    expect(verificationCodeEmail('SIGNUP', code).text).toMatch(
      /creating your InfernoLog account/
    )
    expect(verificationCodeEmail('EMAIL_CHANGE', code).text).toMatch(
      /make this address/
    )
    expect(verificationCodeEmail('PASSWORD_SETUP', code).text).toMatch(
      /add a password/
    )
  })

  it('links an existing account to sign-in and password reset', () => {
    const email = existingAccountEmail('https://infernolog.com')
    expect(email.text).toContain('https://infernolog.com/signin')
    expect(email.text).toContain('https://infernolog.com/forgot-password')
    expect(email.html).toContain(
      'href="https://infernolog.com/forgot-password"'
    )
  })

  it('escapes HTML in interpolated values', () => {
    const email = existingAccountEmail('https://x.test/"><script>')
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('names no address in the email-changed notice', () => {
    const email = emailChangedEmail()
    expect(email.text).not.toMatch(/@/)
    expect(email.subject).toBe('Your InfernoLog email was changed')
  })
})
