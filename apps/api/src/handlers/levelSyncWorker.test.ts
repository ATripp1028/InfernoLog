/**
 * Unit tests for the level-cache sync cron entry point.
 *
 * The handler is thin, but its one decision matters: the delisted-reverify pass
 * is skipped when the main slice aborted, because an abort means RobTop was
 * failing the run and re-checking delisted levels would only burn unreachable
 * calls against the shared rate limit — while the community passes, which talk
 * to different hosts entirely, still run. It also rethrows after logging, so a
 * bad run shows up as a Lambda error rather than only a log line. The sync core
 * is mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/aws-serverless'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { mockRunSlice, mockRunReverify, mockRunAredlList, mockRunCommunity } =
  vi.hoisted(() => ({
    mockRunSlice: vi.fn(),
    mockRunReverify: vi.fn(),
    mockRunAredlList: vi.fn(),
    mockRunCommunity: vi.fn(),
  }))

vi.mock('../services/levels/sync', () => ({
  runLevelSyncSlice: mockRunSlice,
  runDelistedReverifySlice: mockRunReverify,
  runAredlListSync: mockRunAredlList,
  runCommunitySyncSlice: mockRunCommunity,
}))
vi.mock('@sentry/aws-serverless', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { logger } = await import('../utils/logger')
const { handler } = await import('./levelSyncWorker')

// ─── helpers ─────────────────────────────────────────────────────────────────

const mockCaptureException = vi.mocked(Sentry.captureException)

beforeEach(() => {
  vi.clearAllMocks()
  mockRunSlice.mockReset().mockResolvedValue({ aborted: false })
  mockRunReverify.mockReset().mockResolvedValue(undefined)
  mockRunAredlList.mockReset().mockResolvedValue(undefined)
  mockRunCommunity.mockReset().mockResolvedValue(undefined)
})

// ─── the normal run ──────────────────────────────────────────────────────────

describe('levelSyncWorker', () => {
  it('runs the cache slice, the reverify pass, then both community passes', async () => {
    await handler()

    expect(mockRunSlice).toHaveBeenCalledTimes(1)
    expect(mockRunReverify).toHaveBeenCalledTimes(1)
    expect(mockRunAredlList).toHaveBeenCalledTimes(1)
    expect(mockRunCommunity).toHaveBeenCalledTimes(1)
  })

  // One bulk request refreshes every placed level AND tells the rotation which
  // levels are on AREDL at all, so it must reach the rotation rather than being
  // fetched and dropped.
  it('hands the AREDL list to the rotation', async () => {
    const list = new Map([['86407629', {}]])
    mockRunAredlList.mockResolvedValue(list)

    await handler()

    expect(mockRunCommunity).toHaveBeenCalledWith(list)
  })

  it('skips the reverify pass when the main slice aborted', async () => {
    // An abort means RobTop was failing; reverifying would only burn calls
    // against the shared rate limit.
    mockRunSlice.mockResolvedValue({ aborted: true })

    await handler()

    expect(mockRunReverify).not.toHaveBeenCalled()
  })

  it('still runs the community passes when the main slice aborted', async () => {
    // Different hosts: RobTop refusing us says nothing about whether list
    // placements can be refreshed, and they go stale fastest.
    mockRunSlice.mockResolvedValue({ aborted: true })

    await handler()

    expect(mockRunAredlList).toHaveBeenCalledTimes(1)
    expect(mockRunCommunity).toHaveBeenCalledTimes(1)
  })

  it('resolves without reporting anything on a clean run', async () => {
    await expect(handler()).resolves.toBeUndefined()

    expect(mockCaptureException).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })
})

// ─── failures ────────────────────────────────────────────────────────────────

describe('levelSyncWorker — failures', () => {
  it('logs, reports, and rethrows a failing slice', async () => {
    // Rethrown so the run shows as a Lambda error, not just a log line.
    const error = new Error('robtop down')
    mockRunSlice.mockRejectedValue(error)

    await expect(handler()).rejects.toThrow('robtop down')
    expect(logger.error).toHaveBeenCalled()
    expect(mockCaptureException).toHaveBeenCalledWith(error)
  })

  it('rethrows a failure from the reverify pass too', async () => {
    const error = new Error('reverify blew up')
    mockRunReverify.mockRejectedValue(error)

    await expect(handler()).rejects.toThrow('reverify blew up')
    expect(mockCaptureException).toHaveBeenCalledWith(error)
  })

  it('rethrows a failure from the community slice too', async () => {
    const error = new Error('community slice blew up')
    mockRunCommunity.mockRejectedValue(error)

    await expect(handler()).rejects.toThrow('community slice blew up')
    expect(mockCaptureException).toHaveBeenCalledWith(error)
  })
})
