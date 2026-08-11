import { describe, expect, it } from 'vitest'
import { barColor, entryKey, entryLabel, labelColor } from '../runsGraphBars'
import { runsGraphEntry } from './fixtures'

describe('bar colours', () => {
  it.each([barColor, labelColor])(
    'gives each state its own colour (%o)',
    (colorOf) => {
      const colors = [
        colorOf(runsGraphEntry({ kind: 'from_zero' })),
        colorOf(runsGraphEntry({ kind: 'completion' })),
        colorOf(runsGraphEntry({ kind: 'worst_fail' })),
        colorOf(runsGraphEntry({ droppedAfter: true })),
      ]

      expect(new Set(colors).size).toBe(colors.length)
    }
  )

  // A drop is the outcome the reader scans for, so it wins even on the bar
  // that is also the completion or the worst fail.
  it.each(['completion', 'worst_fail', 'from_zero', 'from_run'] as const)(
    'lets a drop override the %s colour',
    (kind) => {
      const dropped = runsGraphEntry({ kind, droppedAfter: true })

      expect(barColor(dropped)).toBe(
        barColor(runsGraphEntry({ kind: 'from_zero', droppedAfter: true }))
      )
    }
  )

  it.each([
    ['from_zero', 'from_run'],
    ['from_run', 'from_zero'],
  ] as const)('colours %s the same as %s — neither is an outcome', (a, b) => {
    expect(barColor(runsGraphEntry({ kind: a }))).toBe(
      barColor(runsGraphEntry({ kind: b }))
    )
  })
})

describe('entryLabel', () => {
  it.each([
    ['completion', 'Completion'],
    ['worst_fail', 'Worst fail'],
  ] as const)('names the %s bar', (kind, expected) => {
    expect(entryLabel(runsGraphEntry({ kind }))).toBe(expected)
  })

  it('describes a run starting from zero by how far it got', () => {
    expect(entryLabel(runsGraphEntry({ from: 0, to: 42 }))).toBe('42% from 0')
  })

  it('describes a mid-level run by its range', () => {
    expect(
      entryLabel(runsGraphEntry({ kind: 'from_run', from: 30, to: 75 }))
    ).toBe('run 30 → 75%')
  })

  // The named outcomes take precedence over the range description, so a
  // completion reads "Completion" rather than "100% from 0".
  it('names an outcome even when it also covers a range', () => {
    expect(
      entryLabel(runsGraphEntry({ kind: 'completion', from: 0, to: 100 }))
    ).toBe('Completion')
  })
})

// React keys these bars, and an edit can reorder them — a key that moves with
// position would let React reuse an unrelated bar's identity.
describe('entryKey', () => {
  it('uses the entry id when there is one', () => {
    expect(entryKey(runsGraphEntry({ progressUpdateId: 'update-7' }))).toBe(
      'update-7'
    )
  })

  it('gives the single worst-fail bar a fixed key', () => {
    expect(
      entryKey(runsGraphEntry({ progressUpdateId: null, kind: 'worst_fail' }))
    ).toBe('worst-fail')
  })

  // A level can be dropped more than once at the same percentage, so the
  // synthetic bars fall back to their own date to stay distinguishable.
  it('distinguishes two drops at the same percentage by date', () => {
    const first = entryKey(
      runsGraphEntry({ progressUpdateId: null, to: 61, date: '2026-01-01' })
    )
    const second = entryKey(
      runsGraphEntry({ progressUpdateId: null, to: 61, date: '2026-02-01' })
    )

    expect(first).not.toBe(second)
  })

  it('still produces a key for a dateless drop', () => {
    expect(
      entryKey(runsGraphEntry({ progressUpdateId: null, to: 61, date: null }))
    ).toBe('drop-61-no-date')
  })

  it('keeps two drops at different percentages apart', () => {
    const a = runsGraphEntry({ progressUpdateId: null, to: 61, date: null })
    const b = runsGraphEntry({ progressUpdateId: null, to: 75, date: null })

    expect(entryKey(a)).not.toBe(entryKey(b))
  })

  it('gives every bar in a realistic graph a distinct key', () => {
    const entries = [
      runsGraphEntry({ progressUpdateId: 'a' }),
      runsGraphEntry({ progressUpdateId: 'b' }),
      runsGraphEntry({ progressUpdateId: null, kind: 'worst_fail' }),
      runsGraphEntry({ progressUpdateId: null, to: 61, date: '2026-01-01' }),
      runsGraphEntry({ progressUpdateId: null, to: 61, date: '2026-02-01' }),
    ]

    const keys = entries.map(entryKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
