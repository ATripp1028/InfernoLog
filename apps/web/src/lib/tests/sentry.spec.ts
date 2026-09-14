import { describe, expect, it } from 'vitest'
import type { ErrorEvent, EventHint } from '@sentry/react'
import { ApiError } from '../api/client'
import { buildSentryOptions } from '../sentry'

// `Leak-Canary-` is allowlisted in .gitleaks.toml.
const PASSWORD = 'Leak-Canary-Pa55!web'

describe('buildSentryOptions', () => {
  const options = buildSentryOptions('https://key@o0.ingest.sentry.io/0')

  // These two are privacy guarantees. If a change needs either one, it needs
  // masking configured and a decision recorded first — not an edit to this
  // spec.
  it('never sends default PII', () => {
    expect(options.sendDefaultPii).toBe(false)
  })

  it('adds no integrations, so Session Replay stays off', () => {
    expect(options.integrations).toBeUndefined()
    expect(options.replaysSessionSampleRate).toBeUndefined()
    expect(options.replaysOnErrorSampleRate).toBeUndefined()
  })

  it('scrubs credential fields from an event it sends', () => {
    const event = {
      type: undefined,
      request: { data: { email: 'a@b.co', password: PASSWORD } },
      breadcrumbs: [{ data: { verificationCode: PASSWORD } }],
    } as unknown as ErrorEvent
    const sent = options.beforeSend?.(event, {} as EventHint)
    expect(sent).not.toBeNull()
    expect(JSON.stringify(sent)).not.toContain(PASSWORD)
  })

  it('still drops expected failures', () => {
    const event = { type: undefined } as unknown as ErrorEvent
    const hint = { originalException: new ApiError(409, 'Conflict') }
    expect(options.beforeSend?.(event, hint as EventHint)).toBeNull()
  })

  it('scrubs credential fields from breadcrumbs', () => {
    const crumb = options.beforeBreadcrumb?.(
      { category: 'fetch', data: { newPassword: PASSWORD } },
      undefined
    )
    expect(JSON.stringify(crumb)).not.toContain(PASSWORD)
  })
})
