import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '@prisma/client'
import * as Sentry from '@sentry/aws-serverless'
import type { GddlSyncResult } from '@infernolog/core'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/aws-serverless', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../utils/kms', () => ({
  decryptSecret: vi.fn(async () => 'plaintext-key'),
}))

const mockSyncGddlSubmissions = vi.fn<() => Promise<GddlSyncResult>>()
vi.mock('../services/gddlSync', () => ({
  syncGddlSubmissions: mockSyncGddlSubmissions,
}))

// Do NOT mock ../utils/gddl — we need the real error classes so that the
// worker's `instanceof GddlError` check works correctly.
const { GddlInvalidKeyError, GddlUnavailableError } = await import('../utils/gddl')
const { handler } = await import('./gddlSyncWorker')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const syncJobMock = (prisma as any).gddlSyncJob

const JOB_ID = 'job-abc'
const USER_ID = 'user-123'
const SYNC_RESULT: GddlSyncResult = { created: 5, enriched: 2, skipped: 10, errors: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mockReset(prisma)
})

afterAll(() => {
  vi.restoreAllMocks()
})

// ─── tests ────────────────────────────────────────────────────────────────────

describe('gddlSyncWorker', () => {
  describe('happy path', () => {
    it('decrypts the key, runs sync, and marks the job completed', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
        gddlApiKeyEncrypted: 'ciphertext',
      } as never)
      mockSyncGddlSubmissions.mockResolvedValueOnce(SYNC_RESULT)
      syncJobMock.update.mockResolvedValueOnce({})

      await handler({ jobId: JOB_ID, userId: USER_ID })

      expect(syncJobMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: JOB_ID },
          data: expect.objectContaining({
            status: 'completed',
            result: SYNC_RESULT,
          }),
        })
      )
      expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('marks the job failed when no API key is configured', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
        gddlApiKeyEncrypted: null,
      } as never)
      syncJobMock.update.mockResolvedValueOnce({})

      await handler({ jobId: JOB_ID, userId: USER_ID })

      expect(mockSyncGddlSubmissions).not.toHaveBeenCalled()
      expect(syncJobMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'failed' }),
        })
      )
      expect(Sentry.captureException).not.toHaveBeenCalled()
    })
  })

  describe('GDDL-side errors — no Sentry, user-friendly messages', () => {
    it('handles GddlInvalidKeyError with a "key rejected" message', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
        gddlApiKeyEncrypted: 'ciphertext',
      } as never)
      mockSyncGddlSubmissions.mockRejectedValueOnce(new GddlInvalidKeyError())
      syncJobMock.update.mockResolvedValueOnce({})

      await handler({ jobId: JOB_ID, userId: USER_ID })

      expect(syncJobMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            error: expect.stringContaining('key'),
          }),
        })
      )
      expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('handles GddlUnavailableError with a "try again" message', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
        gddlApiKeyEncrypted: 'ciphertext',
      } as never)
      mockSyncGddlSubmissions.mockRejectedValueOnce(new GddlUnavailableError())
      syncJobMock.update.mockResolvedValueOnce({})

      await handler({ jobId: JOB_ID, userId: USER_ID })

      expect(syncJobMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            error: expect.stringContaining('GDDL'),
          }),
        })
      )
      expect(Sentry.captureException).not.toHaveBeenCalled()
    })
  })

  describe('internal errors — Sentry is called', () => {
    it('captures unexpected exceptions and marks the job failed', async () => {
      const dbError = new Error('DB connection lost')
      prisma.user.findUniqueOrThrow.mockRejectedValueOnce(dbError)
      syncJobMock.update.mockResolvedValueOnce({})

      await handler({ jobId: JOB_ID, userId: USER_ID })

      expect(Sentry.captureException).toHaveBeenCalledWith(dbError)
      expect(syncJobMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'failed' }),
        })
      )
    })

    it('also captures an exception if the job-status update itself fails', async () => {
      prisma.user.findUniqueOrThrow.mockRejectedValueOnce(new Error('outer'))
      syncJobMock.update.mockRejectedValueOnce(new Error('update failed'))

      // Should not throw — the worker swallows the double-failure.
      await expect(handler({ jobId: JOB_ID, userId: USER_ID })).resolves.toBeUndefined()

      // Sentry was called twice: once for the outer error, once for the update failure.
      expect(Sentry.captureException).toHaveBeenCalledTimes(2)
    })
  })
})
