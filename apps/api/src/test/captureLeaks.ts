// ⚠️ CREDENTIALS — the leak-test harness.
//
// Every route that receives a password or verification code gets a leak test:
// send unique sentinel values through its success path, each expected failure,
// and a forced 500, then assert no sentinel appears in anything logged or
// reported. See CLAUDE.md "Credential handling".
//
// Usage — mock the logger and Sentry with the shared capture, then check it:
//
//   vi.mock('../../utils/logger', async () => {
//     const { leakCapture } = await import('../../test/captureLeaks')
//     return { logger: leakCapture.logger }
//   })
//   vi.mock('@sentry/node', async () => {
//     const { leakCapture } = await import('../../test/captureLeaks')
//     return leakCapture.sentry
//   })
//
//   const password = leakSentinel('password')
//   ...exercise the route...
//   leakCapture.expectNoLeak(password)
//
// The Sentry mock records the raw arguments, before `beforeSend` scrubbing,
// so a test fails on anything handed to Sentry — not only what would survive
// the scrubber.

import { randomUUID } from 'crypto'
import { inspect } from 'util'
import { Writable } from 'stream'
import pino from 'pino'
import { expect, vi } from 'vitest'
import { buildLoggerOptions } from '../utils/loggerOptions'

/**
 * A unique, obviously fake credential for one leak test.
 *
 * The `Leak-Canary-` prefix is allowlisted in `.gitleaks.toml`. The value also
 * meets the password policy, so it passes validation and exercises the
 * success path rather than stopping at a 400.
 *
 * @param label - What the sentinel stands in for, to make a failure readable.
 */
export function leakSentinel(label: string): string {
  return `Leak-Canary-${label}-Pa55!${randomUUID()}`
}

function describe(value: unknown): string {
  let json = ''
  try {
    json = JSON.stringify(value) ?? ''
  } catch {
    // Circular — inspect below still covers it.
  }
  return `${json}\n${inspect(value, { depth: Infinity, showHidden: true })}`
}

function createLeakCapture() {
  const lines: string[] = []
  const sink = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk))
      done()
    },
  })
  // The real options, so redaction behaves as it does in production.
  const logger = pino(buildLoggerOptions('trace'), sink)

  const sentryCalls: unknown[][] = []
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      sentryCalls.push([name, ...args])
      return 'leak-capture-event-id'
    }
  const sentry = {
    captureException: vi.fn(record('captureException')),
    captureMessage: vi.fn(record('captureMessage')),
    addBreadcrumb: vi.fn(record('addBreadcrumb')),
    setExtra: vi.fn(record('setExtra')),
    setContext: vi.fn(record('setContext')),
  }

  /** Everything logged and reported since the last {@link reset}. */
  function output(): string {
    return [...lines, ...sentryCalls.map(describe)].join('\n')
  }

  return {
    logger,
    sentry,
    output,
    /** The captured log lines, parsed, for asserting something was logged. */
    logRecords(): Record<string, unknown>[] {
      return lines.map((line) => JSON.parse(line) as Record<string, unknown>)
    },
    /** The raw arguments of every Sentry call. */
    sentryCalls(): unknown[][] {
      return sentryCalls
    },
    /** Clears captured output. Call in `beforeEach`. */
    reset(): void {
      lines.length = 0
      sentryCalls.length = 0
    },
    /**
     * Fails the test if any sentinel appears in a log line or Sentry call.
     *
     * @param sentinels - Values from {@link leakSentinel}.
     */
    expectNoLeak(...sentinels: string[]): void {
      const captured = output()
      for (const sentinel of sentinels) {
        expect(
          captured.includes(sentinel),
          `credential sentinel leaked into logs or Sentry: ${sentinel.slice(0, 24)}…`
        ).toBe(false)
      }
    },
  }
}

/** The shared capture every leak test mocks the logger and Sentry with. */
export const leakCapture = createLeakCapture()
