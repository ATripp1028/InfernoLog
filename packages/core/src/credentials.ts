// ⚠️ CREDENTIALS — passwords and verification codes.
//
// Rules for any code that touches one, in either app:
//   - Never log it, and never put it in an error message, a Sentry event, or a
//     response body.
//   - Never persist it: not in localStorage, sessionStorage, the query cache,
//     or a database column. Verification codes are stored only as an HMAC.
//   - Name variables so the lint rule can see them: `password`,
//     `currentPassword`, `newPassword`, `verificationCode`. Never a bare
//     `code`, which already means error codes and level codes in this repo.
//
// See CLAUDE.md "Credential handling". This module is the shared half: the
// password policy both apps validate against, and the field names both apps
// scrub from logs and error reports.

import { z } from 'zod'

/** Shortest password Cognito's pool policy accepts. */
export const PASSWORD_MIN_LENGTH = 8

/** Longest password Cognito accepts. */
export const PASSWORD_MAX_LENGTH = 256

/**
 * Every character Cognito counts as a symbol, copied from its password policy
 * documentation. A space also counts, but only between other characters —
 * Cognito rejects a password that starts or ends with one.
 *
 * Anything outside this set (`£`, `é`, an emoji) is not a symbol to Cognito,
 * so a check looser than this one shows a satisfied checklist for a password
 * the pool then refuses.
 */
export const PASSWORD_SYMBOLS = '^$*.[]{}()?"!@#%&/\\,><\':;|_~`=+-'

/** One requirement a password must meet. */
export type PasswordRuleId =
  | 'length'
  | 'lowercase'
  | 'uppercase'
  | 'number'
  | 'symbol'

/** A requirement, with the wording shown beside it in the checklist. */
export interface PasswordRule {
  id: PasswordRuleId
  /** Checklist wording. */
  description: string
  /** Validation message when the rule is unmet. Never includes the value. */
  message: string
  test: (password: string) => boolean
}

function hasSymbol(password: string): boolean {
  for (let i = 0; i < password.length; i++) {
    const char = password[i] as string
    if (PASSWORD_SYMBOLS.includes(char)) return true
    // An interior space counts; a leading or trailing one does not.
    if (char === ' ' && i > 0 && i < password.length - 1) return true
  }
  return false
}

/**
 * The password policy, in checklist order. Mirrors the pool's `passwordPolicy`
 * in apps/api/infra/auth.ts — change both together.
 *
 * Letters are ASCII only, matching Cognito: `é` is neither lowercase nor
 * uppercase to the pool.
 */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    description: `${PASSWORD_MIN_LENGTH}+ characters`,
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    test: (password) =>
      password.length >= PASSWORD_MIN_LENGTH &&
      password.length <= PASSWORD_MAX_LENGTH,
  },
  {
    id: 'lowercase',
    description: 'Lowercase letter',
    message: 'Password must include a lowercase letter',
    test: (password) => /[a-z]/.test(password),
  },
  {
    id: 'uppercase',
    description: 'Uppercase letter',
    message: 'Password must include an uppercase letter',
    test: (password) => /[A-Z]/.test(password),
  },
  {
    id: 'number',
    description: 'Number',
    message: 'Password must include a number',
    test: (password) => /[0-9]/.test(password),
  },
  {
    id: 'symbol',
    description: 'Symbol',
    message: 'Password must include a symbol',
    test: hasSymbol,
  },
]

/**
 * Whether a password meets each rule, in checklist order.
 *
 * The web checklist renders from this and {@link PasswordSchema} validates
 * with the same rules, so the two cannot disagree.
 *
 * @param password - The candidate password. Never logged or stored here.
 */
export function passwordRuleResults(
  password: string
): { id: PasswordRuleId; description: string; met: boolean }[] {
  return PASSWORD_RULES.map(({ id, description, test }) => ({
    id,
    description,
    met: test(password),
  }))
}

/**
 * A password that Cognito's pool policy will accept.
 *
 * Error messages name the unmet rule and never echo the value.
 */
export const PasswordSchema = z
  .string()
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must be at most ${PASSWORD_MAX_LENGTH} characters`
  )
  .superRefine((password, ctx) => {
    if (password !== password.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password can't start or end with a space",
      })
    }
    for (const rule of PASSWORD_RULES) {
      // Too long is already reported by `.max` above; the length rule's
      // "at least" message would be wrong for it.
      if (rule.id === 'length' && password.length > PASSWORD_MAX_LENGTH) {
        continue
      }
      if (!rule.test(password)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: rule.message })
      }
    }
  })

/**
 * An email address, trimmed and lowercased.
 *
 * Every stored email is lowercase (a CHECK constraint enforces it on `users`
 * and `auth_identities`), so every email that crosses the wire goes through
 * this first.
 */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254, 'Email must be at most 254 characters')

// ─────────────────────────────────────────────
// Scrubbing — what logs and error reports must never contain
// ─────────────────────────────────────────────

/** What a scrubbed credential is replaced with. */
export const REDACTED = '[REDACTED]'

/**
 * Field names that hold a credential, wherever they appear. The API's Pino
 * `redact` paths and both apps' Sentry scrubbing are built from this list, so
 * a new credential field name goes here and nowhere else.
 */
export const SENSITIVE_FIELD_NAMES = [
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'verificationCode',
] as const

const SENSITIVE_NAME_PATTERN = /password|verificationcode/i

/**
 * Whether a field name holds a credential.
 *
 * Broader than {@link SENSITIVE_FIELD_NAMES}: it matches any key containing
 * `password` or `verificationCode`, case-insensitively, so a variant nobody
 * added to the list (`passwordConfirmation`) is still caught.
 */
export function isSensitiveFieldName(name: string): boolean {
  return SENSITIVE_NAME_PATTERN.test(name)
}

/**
 * A deep copy of `value` with every credential field replaced by
 * {@link REDACTED}.
 *
 * Walks plain objects and arrays, and is safe on cycles and very deep values.
 * A string is parsed as JSON and scrubbed if it holds an object, because
 * request bodies often reach error reports unparsed. A string that isn't JSON
 * but mentions a credential field is redacted whole, since there is no safe
 * way to cut the value out of it.
 *
 * @param value - Anything an error report or log line is about to carry.
 */
export function scrubSensitiveFields<T>(value: T): T {
  return scrub(value, new WeakSet(), 0) as T
}

const MAX_SCRUB_DEPTH = 20

function scrub(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (typeof value === 'string') return scrubString(value, seen, depth)
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_SCRUB_DEPTH) return REDACTED
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, seen, depth + 1))
  }

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    out[key] = isSensitiveFieldName(key)
      ? REDACTED
      : scrub(child, seen, depth + 1)
  }
  return out
}

function scrubString(
  value: string,
  seen: WeakSet<object>,
  depth: number
): string {
  if (!SENSITIVE_NAME_PATTERN.test(value)) return value
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed !== null && typeof parsed === 'object') {
      return JSON.stringify(scrub(parsed, seen, depth + 1))
    }
  } catch {
    // Not JSON — fall through and redact the whole string.
  }
  return REDACTED
}

/** The parts of an error-report event that can carry request or app data. */
interface ScrubbableEvent {
  request?: { data?: unknown; query_string?: unknown }
  extra?: Record<string, unknown>
  contexts?: Record<string, unknown>
  breadcrumbs?: ScrubbableBreadcrumb[]
}

/** The part of a breadcrumb that can carry data. */
interface ScrubbableBreadcrumb {
  data?: Record<string, unknown>
}

/**
 * A breadcrumb with credential fields removed from its data. Wired as Sentry's
 * `beforeBreadcrumb` in both apps.
 *
 * Typed structurally so core needs no Sentry dependency.
 *
 * @param breadcrumb - The breadcrumb Sentry is about to record.
 */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(
  breadcrumb: T
): T {
  if (!breadcrumb.data) return breadcrumb
  return { ...breadcrumb, data: scrubSensitiveFields(breadcrumb.data) }
}

/**
 * An error-report event with credential fields removed from the request body,
 * query string, extras, contexts and breadcrumbs. Wired into Sentry's
 * `beforeSend` in both apps, so a credential that slips into any of those never
 * leaves the process.
 *
 * Exception messages and stack traces are left alone: they are the report's
 * point, and credentials must never be put into an error message to begin
 * with.
 *
 * @param event - The event Sentry is about to send.
 */
export function scrubErrorEvent<T extends ScrubbableEvent>(event: T): T {
  const out: T = { ...event }
  if (event.request) {
    out.request = {
      ...event.request,
      ...('data' in event.request
        ? { data: scrubSensitiveFields(event.request.data) }
        : {}),
      ...('query_string' in event.request
        ? { query_string: scrubSensitiveFields(event.request.query_string) }
        : {}),
    }
  }
  if (event.extra) out.extra = scrubSensitiveFields(event.extra)
  if (event.contexts) out.contexts = scrubSensitiveFields(event.contexts)
  if (event.breadcrumbs)
    out.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb)
  return out
}
