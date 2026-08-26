/**
 * Unit tests for top-N milestone crossings.
 *
 * The rule with teeth is that a crossing is symmetric and direction-free: the
 * same threshold comes back whether a level entered the top 10 or fell out of
 * it, because the impact row already stores the positions a reader needs to
 * tell those apart. The other is that the TIGHTEST crossed threshold wins — a
 * jump past three boundaries should not report the loosest one.
 */

import { describe, expect, it } from 'vitest'
import { MILESTONE_THRESHOLDS, milestoneCrossed } from './milestones'

describe('milestoneCrossed', () => {
  it('reports nothing when the level did not cross a boundary', () => {
    expect(milestoneCrossed(30, 28)).toBeNull()
  })

  it('reports a crossing when the level moves up past one', () => {
    expect(milestoneCrossed(12, 9)).toBe(10)
  })

  it('reports the same threshold when the level falls back out', () => {
    // Direction is the reader's job — positionBefore/positionAfter say it.
    expect(milestoneCrossed(9, 12)).toBe(10)
  })

  it('reports the tightest boundary when several are crossed at once', () => {
    // #30 → #4 crosses 25, 10 and 5. "Reached the top 5" implies the rest.
    expect(milestoneCrossed(30, 4)).toBe(5)
  })

  it('treats an initial placement as coming from outside every threshold', () => {
    expect(milestoneCrossed(null, 3)).toBe(5)
  })

  it('reports nothing for a placement that lands outside every threshold', () => {
    expect(milestoneCrossed(null, 300)).toBeNull()
  })

  it('treats leaving the ranking as leaving every threshold it was inside', () => {
    // #2 was inside 5, 10, 25… but never inside 1, so 5 is the tightest one it
    // actually crossed on the way out.
    expect(milestoneCrossed(2, null)).toBe(5)
    expect(milestoneCrossed(1, null)).toBe(1)
  })

  it('reports nothing when an unranked level was outside them all anyway', () => {
    expect(milestoneCrossed(300, null)).toBeNull()
  })

  it('treats the boundary position itself as inside', () => {
    // #10 is in the top 10; #11 is not.
    expect(milestoneCrossed(11, 10)).toBe(10)
    expect(milestoneCrossed(10, 9)).toBeNull()
  })

  it('keeps the thresholds ascending, which is what "tightest first" relies on', () => {
    expect([...MILESTONE_THRESHOLDS]).toEqual(
      [...MILESTONE_THRESHOLDS].sort((a, b) => a - b)
    )
  })
})
