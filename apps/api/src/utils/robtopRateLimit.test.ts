/**
 * Unit tests for the RobTop slot acquisition loop.
 *
 * The integration test covers the 429 cooldown against a real database. What it
 * can't reach in reasonable time is the wait deadline — the branch that makes
 * this a rate LIMITER rather than an unbounded queue. If that stopped returning
 * false, every consumer would poll the DB until its own Lambda timeout instead
 * of failing fast and letting the caller fall back. Prisma is mocked and the
 * clock is faked so the 10s wait runs instantly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('./prisma', () => ({ default: prismaMock }))

const { acquireRobtopSlot } = await import('./robtopRateLimit')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

/** The limiter's own defaults — see POLL_MS / DEFAULT_MAX_WAIT_MS. */
const POLL_MS = 120
const DEFAULT_MAX_WAIT_MS = 10_000

/** Queues the outcomes tryAcquire's raw query will report, in order. */
function outcomes(...rows: { cooling: boolean; acquired: boolean }[]) {
  const q = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>
  q.mockReset()
  for (const row of rows) q.mockResolvedValueOnce([row])
  // Anything past the queued list keeps reporting "no tokens".
  q.mockResolvedValue([{ cooling: false, acquired: false }])
}

const ACQUIRED = { cooling: false, acquired: true }
const EMPTY = { cooling: false, acquired: false }
const COOLING = { cooling: true, acquired: false }

/** Runs the acquire, pushing the fake clock past its whole wait window. */
async function runPastDeadline(promise: Promise<boolean>) {
  await vi.advanceTimersByTimeAsync(DEFAULT_MAX_WAIT_MS + POLL_MS * 2)
  return promise
}

beforeEach(() => {
  vi.useFakeTimers()
  outcomes()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── acquiring ───────────────────────────────────────────────────────────────

describe('acquireRobtopSlot', () => {
  it('returns true as soon as a token is granted', async () => {
    outcomes(ACQUIRED)

    await expect(acquireRobtopSlot()).resolves.toBe(true)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('polls until a token frees up', async () => {
    outcomes(EMPTY, EMPTY, ACQUIRED)

    const promise = acquireRobtopSlot()
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)

    await expect(promise).resolves.toBe(true)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3)
  })
})

// ─── the deadline ────────────────────────────────────────────────────────────

describe('acquireRobtopSlot — the wait deadline', () => {
  it('gives up and returns false rather than polling forever', async () => {
    // This is what makes it a limiter: without it a busy period would pin every
    // consumer until its own timeout.
    outcomes()

    await expect(runPastDeadline(acquireRobtopSlot())).resolves.toBe(false)
  })

  it('stops querying once it has given up', async () => {
    outcomes()

    await runPastDeadline(acquireRobtopSlot())
    const callsAtGiveUp = (prisma.$queryRaw as unknown as { mock: { calls: unknown[] } })
      .mock.calls.length

    await vi.advanceTimersByTimeAsync(DEFAULT_MAX_WAIT_MS)

    expect(
      (prisma.$queryRaw as unknown as { mock: { calls: unknown[] } }).mock.calls
        .length
    ).toBe(callsAtGiveUp)
  })

  it('honours a shorter caller-supplied wait', async () => {
    outcomes()

    const promise = acquireRobtopSlot(POLL_MS)
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)

    await expect(promise).resolves.toBe(false)
    // Far fewer polls than the default window would have produced.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2)
  })
})

// ─── the cooldown short-circuit ──────────────────────────────────────────────

describe('acquireRobtopSlot — active cooldown', () => {
  it('returns false immediately instead of polling it out', async () => {
    // A cooldown runs for whole minutes, so polling would just add latency to a
    // user-facing request that is going to fail anyway.
    outcomes(COOLING)

    await expect(acquireRobtopSlot()).resolves.toBe(false)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('does not wait even when a long window was allowed', async () => {
    outcomes(COOLING)

    await expect(acquireRobtopSlot(60_000)).resolves.toBe(false)
  })
})
