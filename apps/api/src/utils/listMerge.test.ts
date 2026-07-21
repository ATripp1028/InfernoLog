import { describe, it, expect } from 'vitest'
import { computeListMerge } from './listMerge'

describe('computeListMerge', () => {
  it('auto-splices a pure append with no conflict', () => {
    const result = computeListMerge(['A', 'B', 'C'], ['A', 'B', 'C', 'D'])
    expect(result).toEqual({
      mergedSeed: ['A', 'B', 'C', 'D'],
      importedRemainder: [],
      existingRemainder: [],
      hasConflict: false,
    })
  })

  it('detects a genuine order conflict and drags along an adjacent pure addition', () => {
    // existing [A,B,C] vs imported [A,C,D,B]: B-vs-C disagree, so the
    // backbone is only [A,B] — and D, though it has no counterpart on the
    // existing side, sits in the same contested run as C in imported's
    // sequence, so its safe position can't be established independently.
    const result = computeListMerge(['A', 'B', 'C'], ['A', 'C', 'D', 'B'])
    expect(result.mergedSeed).toEqual(['A', 'B'])
    expect(result.importedRemainder).toEqual(['C', 'D'])
    expect(result.existingRemainder).toEqual(['C'])
    expect(result.hasConflict).toBe(true)
  })

  it('flags a pure omission as a conflict even with no order disagreement', () => {
    const result = computeListMerge(['A', 'B', 'C'], ['A', 'B'])
    expect(result.mergedSeed).toEqual(['A', 'B'])
    expect(result.importedRemainder).toEqual([])
    expect(result.existingRemainder).toEqual(['C'])
    expect(result.hasConflict).toBe(true)
  })

  it('reports no conflict when both orderings are empty', () => {
    const result = computeListMerge([], [])
    expect(result).toEqual({
      mergedSeed: [],
      importedRemainder: [],
      existingRemainder: [],
      hasConflict: false,
    })
  })

  it('auto-splices an imported-only run that never touches a contested id', () => {
    // X and Y sit between the agreed anchors A and B, and neither is
    // contested — safe to splice in, in their own relative order.
    const result = computeListMerge(['A', 'B'], ['A', 'X', 'Y', 'B'])
    expect(result.mergedSeed).toEqual(['A', 'X', 'Y', 'B'])
    expect(result.importedRemainder).toEqual([])
    expect(result.existingRemainder).toEqual([])
    expect(result.hasConflict).toBe(false)
  })

  it('treats a fresh import against an empty existing list as a pure addition', () => {
    const result = computeListMerge([], ['A', 'B', 'C'])
    expect(result).toEqual({
      mergedSeed: ['A', 'B', 'C'],
      importedRemainder: [],
      existingRemainder: [],
      hasConflict: false,
    })
  })

  it('treats a sheet that omits every existing entry as a full conflict', () => {
    const result = computeListMerge(['A', 'B', 'C'], [])
    expect(result.mergedSeed).toEqual([])
    expect(result.importedRemainder).toEqual([])
    expect(result.existingRemainder).toEqual(['A', 'B', 'C'])
    expect(result.hasConflict).toBe(true)
  })
})
