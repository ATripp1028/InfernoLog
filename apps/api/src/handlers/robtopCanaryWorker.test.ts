/**
 * Unit tests for the RobTop reachability canary cron entry point.
 *
 * The handler is thin, and its one decision is what NOT to do: an unreachable
 * result is the canary working, not the handler failing, so it must not be
 * rethrown on top of the alert the service already raised. Only an unexpected
 * throw becomes a Lambda error. The canary service is mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/aws-serverless'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { mockRunCanary } = vi.hoisted(() => ({ mockRunCanary: vi.fn() }))

vi.mock('../services/levels/canary', () => ({
  runRobtopCanary: mockRunCanary,
}))
vi.mock('@sentry/aws-serverless', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { logger } = await import('../utils/logger')
const { handler } = await import('./robtopCanaryWorker')

const mockCaptureException = vi.mocked(Sentry.captureException)

beforeEach(() => {
  vi.clearAllMocks()
  mockRunCanary.mockReset().mockResolvedValue('healthy')
})

describe('robtopCanaryWorker', () => {
  it('runs one check and reports nothing on a healthy run', async () => {
    await expect(handler()).resolves.toBeUndefined()

    expect(mockRunCanary).toHaveBeenCalledTimes(1)
    expect(mockCaptureException).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it.each(['unreachable', 'cooling', 'level_missing'])(
    'succeeds on a %s result rather than failing the run',
    async (outcome) => {
      // The service already alerted; rethrowing would double-report it as a
      // Lambda error and make an upstream outage look like a broken cron.
      mockRunCanary.mockResolvedValue(outcome)

      await expect(handler()).resolves.toBeUndefined()
      expect(mockCaptureException).not.toHaveBeenCalled()
    }
  )

  it('logs, reports, and rethrows an unexpected failure', async () => {
    const error = new Error('cooldown read failed')
    mockRunCanary.mockRejectedValue(error)

    await expect(handler()).rejects.toThrow('cooldown read failed')
    expect(logger.error).toHaveBeenCalled()
    expect(mockCaptureException).toHaveBeenCalledWith(error)
  })
})
