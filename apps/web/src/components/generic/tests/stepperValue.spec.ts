import { describe, expect, it } from 'vitest'
import {
  clampTo,
  commitValue,
  formatDelta,
  formatValue,
  orderedDeltas,
  roundTo,
  stepValue,
  type StepperBounds,
} from '../stepperValue'

/** The weight-editor defaults: a 0-1 fraction at two decimals. */
const WEIGHT: StepperBounds = { min: 0, max: 1, precision: 2 }
/** The 0-10 rating case, one decimal. */
const RATING: StepperBounds = { min: 0, max: 10, precision: 1 }

describe('roundTo', () => {
  it('snaps to the given precision', () => {
    expect(roundTo(0.12345, 2)).toBe(0.12)
    expect(roundTo(0.126, 2)).toBe(0.13)
  })

  it('rounds to a whole number at precision zero', () => {
    expect(roundTo(4.6, 0)).toBe(5)
  })

  it('leaves an already-exact value alone', () => {
    expect(roundTo(0.5, 2)).toBe(0.5)
  })

  // Accumulating steps in binary floating point drifts; without the snap a
  // few clicks leave 0.30000000000000004 in the field.
  it('cleans up floating-point drift', () => {
    expect(roundTo(0.1 + 0.2, 2)).toBe(0.3)
  })
})

describe('clampTo', () => {
  it('leaves a value inside the range alone', () => {
    expect(clampTo(0.5, 0, 1)).toBe(0.5)
  })

  it('pulls a value up to the floor', () => {
    expect(clampTo(-3, 0, 1)).toBe(0)
  })

  it('pulls a value down to the ceiling', () => {
    expect(clampTo(9, 0, 1)).toBe(1)
  })

  it('keeps the endpoints themselves', () => {
    expect(clampTo(0, 0, 1)).toBe(0)
    expect(clampTo(1, 0, 1)).toBe(1)
  })
})

describe('formatValue', () => {
  it('fixes the value to the stepper’s precision', () => {
    expect(formatValue(0.5, 2)).toBe('0.50')
    expect(formatValue(1, 2)).toBe('1.00')
  })

  it('drops the decimal point at precision zero', () => {
    expect(formatValue(42, 0)).toBe('42')
  })

  // A NaN in the field would be uneditable — every keystroke would parse back
  // to NaN and the user could never recover.
  it.each([NaN, Infinity, -Infinity])(
    'shows zero rather than %p',
    (value) => {
      expect(formatValue(value, 2)).toBe('0.00')
    }
  )
})

describe('commitValue', () => {
  it('parses what the user typed', () => {
    expect(commitValue('0.42', 0, WEIGHT)).toBe(0.42)
  })

  it('rounds a value finer than the precision allows', () => {
    expect(commitValue('0.4567', 0, WEIGHT)).toBe(0.46)
  })

  it('clamps a value above the ceiling', () => {
    expect(commitValue('5', 0, WEIGHT)).toBe(1)
  })

  it('clamps a value below the floor', () => {
    expect(commitValue('-5', 0.5, WEIGHT)).toBe(0)
  })

  it('ignores surrounding whitespace', () => {
    expect(commitValue('  0.42  ', 0, WEIGHT)).toBe(0.42)
  })

  // The user cleared the field to type and then tabbed away; leaving it empty
  // would strand the stepper on no value at all.
  it('reads an emptied field as the floor', () => {
    expect(commitValue('', 0.5, WEIGHT)).toBe(0)
  })

  it('reads a whitespace-only field the same way', () => {
    expect(commitValue('   ', 0.5, WEIGHT)).toBe(0)
  })

  // Unparseable text leaves the value alone rather than zeroing work the user
  // did not mean to discard.
  it.each(['abc', '1.2.3', '--5'])(
    'keeps the current value for the unparseable %p',
    (raw) => {
      expect(commitValue(raw, 0.42, WEIGHT)).toBe(0.42)
    }
  )

  it('accepts a plain integer', () => {
    expect(commitValue('7', 0, RATING)).toBe(7)
  })

  it('honours the stepper’s own bounds', () => {
    expect(commitValue('9.5', 0, RATING)).toBe(9.5)
    expect(commitValue('9.5', 0, WEIGHT)).toBe(1)
  })
})

describe('stepValue', () => {
  it('moves the value up by the delta', () => {
    expect(stepValue(0.5, 0.1, WEIGHT)).toBe(0.6)
  })

  it('moves it down by a negative delta', () => {
    expect(stepValue(0.5, -0.1, WEIGHT)).toBe(0.4)
  })

  // Repeated steps are exactly where binary drift shows up.
  it('does not accumulate floating-point drift', () => {
    let v = 0
    for (let i = 0; i < 10; i++) v = stepValue(v, 0.1, WEIGHT)

    expect(v).toBe(1)
  })

  it('stops at the ceiling', () => {
    expect(stepValue(0.95, 0.1, WEIGHT)).toBe(1)
  })

  it('stops at the floor', () => {
    expect(stepValue(0.05, -0.1, WEIGHT)).toBe(0)
  })

  it('is already at rest on an endpoint', () => {
    expect(stepValue(1, 0.1, WEIGHT)).toBe(1)
    expect(stepValue(0, -0.1, WEIGHT)).toBe(0)
  })

  // The whole reason the component exists rather than a native number input:
  // more than one increment on the same field.
  it('supports a coarse and a fine delta on the same value', () => {
    expect(stepValue(0.5, 0.01, WEIGHT)).toBe(0.51)
    expect(stepValue(0.5, 0.1, WEIGHT)).toBe(0.6)
  })

  it('rounds a delta finer than the precision away', () => {
    expect(stepValue(0.5, 0.004, WEIGHT)).toBe(0.5)
  })
})

describe('formatDelta', () => {
  it.each([
    [0.1, '.1'],
    [0.01, '.01'],
    [0.5, '.5'],
  ])('strips the leading zero from %s', (delta, label) => {
    expect(formatDelta(delta)).toBe(label)
  })

  it.each([
    [1, '1'],
    [5, '5'],
    [10, '10'],
  ])('leaves the whole number %s alone', (delta, label) => {
    expect(formatDelta(delta)).toBe(label)
  })

  // 0.10 and 0.1 are the same number, so they must not read as two buttons.
  it('does not distinguish 0.10 from 0.1', () => {
    expect(formatDelta(0.1)).toBe(formatDelta(0.1))
    expect(formatDelta(0.1)).not.toContain('0')
  })
})

// Smallest closest to the input on both sides, so the buttons read outward by
// magnitude however the caller listed them.
describe('orderedDeltas', () => {
  it('puts the largest leftmost on the minus side', () => {
    expect(orderedDeltas([0.1, 0.01], 'minus')).toEqual([0.1, 0.01])
  })

  it('puts the smallest leftmost on the plus side', () => {
    expect(orderedDeltas([0.1, 0.01], 'plus')).toEqual([0.01, 0.1])
  })

  it('mirrors the two sides', () => {
    const deltas = [1, 5, 10]

    expect(orderedDeltas(deltas, 'minus')).toEqual(
      [...orderedDeltas(deltas, 'plus')].reverse()
    )
  })

  it('sorts however the caller listed them', () => {
    expect(orderedDeltas([0.01, 0.1], 'plus')).toEqual([0.01, 0.1])
    expect(orderedDeltas([0.1, 0.01], 'plus')).toEqual([0.01, 0.1])
  })

  it('handles more than two deltas', () => {
    expect(orderedDeltas([10, 1, 5], 'plus')).toEqual([1, 5, 10])
  })

  it('leaves the caller’s array untouched', () => {
    const deltas = [0.1, 0.01]

    orderedDeltas(deltas, 'plus')

    expect(deltas).toEqual([0.1, 0.01])
  })

  it('handles a single delta', () => {
    expect(orderedDeltas([1], 'minus')).toEqual([1])
  })
})
