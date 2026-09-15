import pino from 'pino'
import { buildLoggerOptions } from './loggerOptions'

/**
 * The API's Pino logger — use this rather than `console.*` in handlers,
 * services, and workers, so output stays structured and level-filtered.
 *
 * Writes synchronously: Lambda freezes the execution environment the moment a
 * handler returns, which would drop anything still buffered.
 *
 * Level comes from `LOG_LEVEL`, defaulting to `info`. Credential field names
 * are redacted (see `loggerOptions.ts`), but that is a safety net: never log a
 * password or verification code in the first place.
 */
export const logger = pino(
  buildLoggerOptions(),
  pino.destination({ sync: true })
)
