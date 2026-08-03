/**
 * Integration tests for the shared RobTop rate limiter's 429 cooldown. Hits the
 * local test database (the robtop_rate_limit singleton row is created by the
 * migration). Verifies that a reported throttle blocks every consumer until the
 * cooldown elapses, and that reporting only ever extends the cooldown.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestPrisma } from '../test/utils'

vi.mock('./prisma', async () => {
  const { getTestPrisma } = await import('../test/utils')
  return { default: getTestPrisma() }
})

const { acquireRobtopSlot, reportRobtopThrottled } = await import(
  './robtopRateLimit'
)

const prisma = getTestPrisma()

// Puts the singleton bucket in a known "full, no cooldown" state.
async function resetBucket() {
  await prisma.robtopRateLimit.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', tokens: 3, lastRefillAt: new Date() },
    update: { tokens: 3, lastRefillAt: new Date(), cooldownUntil: null },
  })
}

async function setCooldown(until: Date | null) {
  await prisma.robtopRateLimit.update({
    where: { id: 'singleton' },
    data: { cooldownUntil: until },
  })
}

beforeEach(async () => {
  await resetBucket()
})

describe('robtop rate limiter — 429 cooldown', () => {
  it('grants a slot when full and not cooling down', async () => {
    expect(await acquireRobtopSlot(0)).toBe(true)
  })

  it('grants nothing while a reported cooldown is active, even with tokens available', async () => {
    await resetBucket() // full tokens
    await reportRobtopThrottled(60_000)

    expect(await acquireRobtopSlot(0)).toBe(false)
  })

  it('grants again once the cooldown has elapsed', async () => {
    await reportRobtopThrottled(60_000)
    expect(await acquireRobtopSlot(0)).toBe(false)

    // Simulate the cooldown having passed.
    await setCooldown(new Date(Date.now() - 1000))
    await prisma.robtopRateLimit.update({
      where: { id: 'singleton' },
      data: { tokens: 3, lastRefillAt: new Date() },
    })

    expect(await acquireRobtopSlot(0)).toBe(true)
  })

  it('only extends the cooldown, never shortens it', async () => {
    const farFuture = new Date(Date.now() + 10 * 60_000)
    await setCooldown(farFuture)

    // A shorter throttle must not pull the cooldown earlier.
    await reportRobtopThrottled(1_000)

    const row = await prisma.robtopRateLimit.findUniqueOrThrow({
      where: { id: 'singleton' },
      select: { cooldownUntil: true },
    })
    expect(row.cooldownUntil?.getTime()).toBe(farFuture.getTime())
  })
})
