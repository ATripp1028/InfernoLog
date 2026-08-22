import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/robtop', () => ({ fetchRobtopLevelResult: vi.fn() }))
vi.mock('../../utils/robtopRateLimit', () => ({ isRobtopCooling: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@sentry/aws-serverless', () => ({ captureMessage: vi.fn() }))

const { runRobtopCanary } = await import('./canary')
const { fetchRobtopLevelResult } = await import('../../utils/robtop')
const { isRobtopCooling } = await import('../../utils/robtopRateLimit')
const Sentry = await import('@sentry/aws-serverless')

const fetchMock = vi.mocked(fetchRobtopLevelResult)
const coolingMock = vi.mocked(isRobtopCooling)
const captureMessageMock = vi.mocked(Sentry.captureMessage)

beforeEach(() => {
  fetchMock.mockReset()
  coolingMock.mockReset().mockResolvedValue(false)
  captureMessageMock.mockReset()
})

describe('runRobtopCanary', () => {
  it('reports healthy and alerts nobody when RobTop answers', async () => {
    fetchMock.mockResolvedValue({
      status: 'found',
      level: { name: '1st level' } as never,
    })

    await expect(runRobtopCanary()).resolves.toBe('healthy')
    expect(captureMessageMock).not.toHaveBeenCalled()
  })

  it('waits far longer than a user request for a limiter slot', async () => {
    // A limiter timeout comes back as `unreachable`, so a drained token bucket
    // would page as an outage on the default 10s wait.
    fetchMock.mockResolvedValue({
      status: 'found',
      level: { name: '1st level' } as never,
    })

    await runRobtopCanary()

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), 30_000)
  })

  it('alerts when RobTop is unreachable', async () => {
    fetchMock.mockResolvedValue({ status: 'unreachable' })

    await expect(runRobtopCanary()).resolves.toBe('unreachable')
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('unreachable'),
      'error'
    )
  })

  it('skips the check entirely while a cooldown is open', async () => {
    // The cooldown means we are choosing not to call — whatever opened it has
    // already reported itself, and calling anyway would add load to a RobTop
    // that is refusing us.
    coolingMock.mockResolvedValue(true)

    await expect(runRobtopCanary()).resolves.toBe('cooling')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(captureMessageMock).not.toHaveBeenCalled()
  })

  it('distinguishes a deleted canary level from an outage', async () => {
    // RobTop answered — it just says this level is gone. That is a config
    // problem with the canary, and must not read as RobTop being down.
    fetchMock.mockResolvedValue({ status: 'not_found' })

    await expect(runRobtopCanary()).resolves.toBe('level_missing')
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('ROBTOP_CANARY_LEVEL_ID'),
      'warning'
    )
  })
})
