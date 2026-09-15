import type { LoggerOptions } from 'pino'
import { REDACTED, SENSITIVE_FIELD_NAMES } from '@infernolog/core'

// Pino's redact paths are exact, with `*` matching a single level, so each
// credential field name is covered at the top level and a few levels down.
// Deeper than that is not a supported place to put one: log the fields you
// mean, not whole request bodies (CODE_QUALITY.md, Backend §2).
const REDACT_DEPTH = 3

function redactPaths(): string[] {
  const paths: string[] = []
  for (const name of SENSITIVE_FIELD_NAMES) {
    for (let depth = 0; depth <= REDACT_DEPTH; depth++) {
      paths.push([...Array(depth).fill('*'), name].join('.'))
    }
  }
  return paths
}

/**
 * The API logger's options.
 *
 * Kept apart from `logger.ts` so the redaction can be tested against a real
 * Pino instance without that module's synchronous stdout destination.
 *
 * `redact` is a safety net for the credential rules, not a licence to log
 * bodies: a credential field logged by mistake prints `[REDACTED]`. The rules
 * themselves (never log a credential; unwrap `Sensitive` only at the call that
 * needs it) are what keep credentials out.
 *
 * @param level - Minimum level to emit; defaults to `LOG_LEVEL`, then `info`.
 */
export function buildLoggerOptions(
  level: string = process.env.LOG_LEVEL || 'info'
): LoggerOptions {
  return {
    level,
    redact: { paths: redactPaths(), censor: REDACTED },
  }
}
