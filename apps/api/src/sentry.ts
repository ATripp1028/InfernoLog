import * as Sentry from '@sentry/node'
import { scrubBreadcrumb, scrubErrorEvent } from '@infernolog/core'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  // Credential fields (passwords, verification codes) are stripped from every
  // event and breadcrumb before it leaves the Lambda. A safety net only —
  // never put a credential into an error or a Sentry call in the first place.
  // See CLAUDE.md "Credential handling".
  beforeSend: (event) => scrubErrorEvent(event),
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
})

export { Sentry }
