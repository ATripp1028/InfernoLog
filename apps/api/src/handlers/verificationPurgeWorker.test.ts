/**
 * Unit tests for the hourly verification purge cron entry point. The service
 * is mocked; its deletion window is covered by the verification integration
 * tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/aws-serverless'

const { mockPurge } = vi.hoisted(() => ({ mockPurge: vi.fn() }))

vi.mock('../services/verification', () => ({
  purgeExpiredVerifications: mockPurge,
}))
vi.mock('@sentry/aws-serverless', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { logger } = await import('../utils/logger')
const { handler } = await import('./verificationPurgeWorker')

beforeEach(() => {
  vi.clearAllMocks()
  mockPurge.mockReset().mockResolvedValue(3)
})

describe('verificationPurgeWorker', () => {
  it('purges and logs how many rows went', async () => {
    await expect(handler()).resolves.toBeUndefined()
    expect(mockPurge).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      { deleted: 3 },
      expect.stringContaining('purged')
    )
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('reports and rethrows a failed run', async () => {
    const failure = new Error('database unavailable')
    mockPurge.mockRejectedValue(failure)
    await expect(handler()).rejects.toBe(failure)
    expect(Sentry.captureException).toHaveBeenCalledWith(failure)
  })
})
