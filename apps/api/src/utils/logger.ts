import pino from 'pino'

/**
 * The API's Pino logger — use this rather than `console.*` in handlers,
 * services, and workers, so output stays structured and level-filtered.
 *
 * Writes synchronously: Lambda freezes the execution environment the moment a
 * handler returns, which would drop anything still buffered.
 *
 * Level comes from `LOG_LEVEL`, defaulting to `info`.
 */
export const logger = pino(
  { level: process.env.LOG_LEVEL || 'info' },
  pino.destination({ sync: true })
)
