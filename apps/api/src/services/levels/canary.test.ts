/**
 * Unit tests for the RobTop reachability canary.
 *
 * Two behaviours carry the weight here. It alerts only on a FAILED PAIR — a
 * lone transient failure is what produced the 2026-08-27 false alarm, and a
 * canary that cries wolf every couple of days is worse than none. And when it
 * does alert, the message has to match what happened: a refusal sends someone
 * to compare egress IPs while the block is live, a timeout must not.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/robtop', () => ({ fetchRobtopLevelResult: vi.fn() }))
vi.mock('../../utils/robtopRateLimit', () => ({ isRobtopCooling: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@sentry/aws-serverless', () => ({ captureMessage: vi.fn() }))

const { runRobtopCanary } = await import('./canary')
const { fetchRobtopLevelResult } = await import('../../utils/robtop')
const { isRobtopCooling } = await import('../../utils/robtopRateLimit')
const { logger } = await import('../../utils/logger')
const Sentry = await import('@sentry/aws-serverless')

const fetchMock = vi.mocked(fetchRobtopLevelResult)
const coolingMock = vi.mocked(isRobtopCooling)
const captureMessageMock = vi.mocked(Sentry.captureMessage)

const FOUND = { status: 'found', level: { name: '1st level' } } as never
const NOT_FOUND = { status: 'not_found' } as never
const failed = (reason: string) => ({ status: 'unreachable', reason }) as never

beforeEach(() => {
  // The retry sleeps; fake timers keep that out of the suite's wall clock.
  vi.useFakeTimers()
  fetchMock.mockReset()
  coolingMock.mockReset().mockResolvedValue(false)
  captureMessageMock.mockReset()
  vi.mocked(logger.warn).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Runs the canary, letting the retry delay elapse. */
async function run(): Promise<string> {
  const outcome = runRobtopCanary()
  await vi.advanceTimersByTimeAsync(5_000)
  return outcome
}

describe('runRobtopCanary', () => {
  it('reports healthy on the first sample, without a second call', async () => {
    fetchMock.mockResolvedValue(FOUND)

    await expect(run()).resolves.toBe('healthy')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(captureMessageMock).not.toHaveBeenCalled()
  })

  it('waits far longer than a user request for a limiter slot', async () => {
    // A limiter timeout comes back as `unreachable`, so a drained token bucket
    // would page as an outage on the default 10s wait.
    fetchMock.mockResolvedValue(FOUND)

    await run()

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), 30_000)
  })

  it('skips the check entirely while a cooldown is open', async () => {
    // The cooldown means we are choosing not to call — whatever opened it has
    // already reported itself, and calling anyway would add load to a RobTop
    // that is refusing us.
    coolingMock.mockResolvedValue(true)

    await expect(run()).resolves.toBe('cooling')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(captureMessageMock).not.toHaveBeenCalled()
  })

  it('distinguishes a deleted canary level from an outage, without retrying', async () => {
    // RobTop answered — it just says this level is gone. A definite answer from
    // a working server is not worth asking twice.
    fetchMock.mockResolvedValue(NOT_FOUND)

    await expect(run()).resolves.toBe('level_missing')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('CANARY_LEVEL_ID'),
      'warning'
    )
  })
})

describe('runRobtopCanary — alerting only on a failed pair', () => {
  it('absorbs a lone transient failure when the retry succeeds', async () => {
    // The 2026-08-27 false alarm: one AbortError between 191 healthy checks.
    fetchMock.mockResolvedValueOnce(failed('timeout')).mockResolvedValue(FOUND)

    await expect(run()).resolves.toBe('recovered')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(captureMessageMock).not.toHaveBeenCalled()
    // Still visible in the logs — a blip that starts recurring is worth seeing.
    expect(logger.warn).toHaveBeenCalled()
  })

  it('alerts when both samples fail', async () => {
    fetchMock.mockResolvedValue(failed('timeout'))

    await expect(run()).resolves.toBe('unreachable')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('did not answer twice'),
      'error'
    )
  })

  it('sends someone to the probe when RobTop actually refused us', async () => {
    // The real block sequence: a 403 opens the shared cooldown, which then
    // denies the retry its slot. Both reasons belong in the alert.
    fetchMock
      .mockResolvedValueOnce(failed('blocked'))
      .mockResolvedValue(failed('limiter'))

    await run()

    const [message] = captureMessageMock.mock.calls[0]!
    expect(message).toContain('REFUSED')
    expect(message).toContain('probe:robtop')
    expect(message).toContain('blocked then limiter')
  })

  it('does not call a timeout a block', async () => {
    // Nobody refused anything here; sending someone to compare egress IPs over
    // a slow response wastes the window and erodes trust in the alert.
    fetchMock
      .mockResolvedValueOnce(failed('timeout'))
      .mockResolvedValue(failed('network'))

    await run()

    const [message] = captureMessageMock.mock.calls[0]!
    expect(message).toContain('NOT a refusal')
    expect(message).not.toContain('probe:robtop')
  })
})
