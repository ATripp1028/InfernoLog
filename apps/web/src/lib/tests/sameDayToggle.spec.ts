import { describe, expect, it } from 'vitest'
import { isSameDayToggleOn } from '../sameDayToggle'

describe('isSameDayToggleOn', () => {
  it('recognizes the one-second-earlier instant it writes', () => {
    expect(
      isSameDayToggleOn(
        '2026-03-14T18:30:00.000Z',
        'UTC',
        '2026-03-14T18:29:59.000Z',
        'UTC'
      )
    ).toBe(true)
  })

  it('rejects an instant that is merely close', () => {
    expect(
      isSameDayToggleOn(
        '2026-03-14T18:30:00.000Z',
        'UTC',
        '2026-03-14T18:29:58.000Z',
        'UTC'
      )
    ).toBe(false)
  })

  it('rejects an instant on the wrong side', () => {
    expect(
      isSameDayToggleOn(
        '2026-03-14T18:30:00.000Z',
        'UTC',
        '2026-03-14T18:30:01.000Z',
        'UTC'
      )
    ).toBe(false)
  })

  // With no time entered both fields are bare dates, so the toggle writes
  // them identical rather than offsetting.
  it('matches two identical bare dates', () => {
    expect(isSameDayToggleOn('2026-03-14', null, '2026-03-14', null)).toBe(true)
  })

  it('rejects two different bare dates', () => {
    expect(isSameDayToggleOn('2026-03-14', null, '2026-03-13', null)).toBe(
      false
    )
  })

  // The toggle always writes matching zones for both fields, so a mismatched
  // pair came from somewhere else (imported or legacy data) and cannot be
  // "toggle on" whatever the timestamps say.
  it.each([
    ['one zoned, one not', 'UTC', null],
    ['two different zones', 'UTC', 'Asia/Tokyo'],
  ])('rejects a mismatched pair with %s', (_label, anchorTz, worstTz) => {
    expect(
      isSameDayToggleOn(
        '2026-03-14T18:30:00.000Z',
        anchorTz,
        '2026-03-14T18:29:59.000Z',
        worstTz
      )
    ).toBe(false)
  })

  it.each([
    ['no anchor date', null, '2026-03-14'],
    ['no worst-fail date', '2026-03-14', null],
    ['neither', null, null],
  ])('rejects %s', (_label, anchor, worstFail) => {
    expect(isSameDayToggleOn(anchor, null, worstFail, null)).toBe(false)
  })
})
