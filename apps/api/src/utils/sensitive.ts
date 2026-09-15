// ⚠️ CREDENTIALS — this wrapper exists so a password or verification code
// cannot reach a log line, an error message, or a Sentry event by accident.
//
// Never log a credential, never put one in an error message, never persist
// one. Unwrap with `.reveal()` only at the call that genuinely needs the
// plaintext (the Cognito SDK call, the HMAC), and never inside a logger,
// console, or Sentry call — lint rejects that. See CLAUDE.md "Credential
// handling".

import { inspect } from 'util'
import { REDACTED } from '@infernolog/core'

/**
 * A credential that redacts itself everywhere it could be printed.
 *
 * `String(x)`, a template literal, `JSON.stringify`, `console.log` and Pino
 * all see `[REDACTED]`. The value comes out only through {@link reveal}, which
 * is easy to grep for and which the lint rule forbids inside logging calls.
 *
 * Wrap a credential the moment it is parsed from a request, so every line
 * after that handles the wrapper rather than the string.
 */
export class Sensitive {
  // A true private field: not an own enumerable property, so no serializer,
  // spread, or Object.entries walk can find it.
  readonly #value: string

  constructor(value: string) {
    this.#value = value
  }

  /**
   * The plaintext. Call only where the plaintext is the point — passing it to
   * Cognito or into the HMAC — and never inside a logger, console, or Sentry
   * call.
   */
  reveal(): string {
    return this.#value
  }

  /**
   * Compares two credentials without revealing either to the caller.
   *
   * Not constant-time; use `timingSafeEqual` on hashes where timing matters.
   */
  equals(other: Sensitive): boolean {
    return this.#value === other.#value
  }

  toString(): string {
    return REDACTED
  }

  toJSON(): string {
    return REDACTED
  }

  [inspect.custom](): string {
    return REDACTED
  }

  [Symbol.toPrimitive](): string {
    return REDACTED
  }
}
