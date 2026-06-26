import { describe, it, expect } from 'vitest'
import {
  computeRunsGraph,
  type ProgressUpdateForGraph,
  type DropForGraph,
} from './runsGraph'

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeUpdate(
  overrides: Partial<ProgressUpdateForGraph> & { id: string }
): ProgressUpdateForGraph {
  return {
    isCompletion: false,
    percentage: null,
    runFrom: null,
    runTo: null,
    date: null,
    dateUncertain: false,
    loggedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  }
}

function drop(
  overrides: Partial<DropForGraph> = {}
): DropForGraph {
  return { droppedAt: null, attemptsAtDrop: null, worstFail: null, ...overrides }
}

// ─────────────────────────────────────────────
// kind classification
// ─────────────────────────────────────────────

describe('computeRunsGraph — kind classification', () => {
  it('from_zero entry: from=0, to=percentage', () => {
    const u = makeUpdate({ id: 'u1', percentage: 72, loggedAt: new Date('2025-03-01') })
    const graph = computeRunsGraph([u], [])
    expect(graph).toHaveLength(1)
    expect(graph[0]).toMatchObject({ progressUpdateId: 'u1', kind: 'from_zero', from: 0, to: 72 })
  })

  it('from_run entry: from=runFrom, to=runTo', () => {
    const u = makeUpdate({ id: 'u1', runFrom: 44, runTo: 87, loggedAt: new Date('2025-03-01') })
    const graph = computeRunsGraph([u], [])
    expect(graph).toHaveLength(1)
    expect(graph[0]).toMatchObject({ progressUpdateId: 'u1', kind: 'from_run', from: 44, to: 87 })
  })

  it('completion entry: from=0, to=100, kind=completion', () => {
    const u = makeUpdate({ id: 'u1', isCompletion: true, loggedAt: new Date('2025-03-01') })
    const graph = computeRunsGraph([u], [])
    expect(graph).toHaveLength(1)
    expect(graph[0]).toMatchObject({ progressUpdateId: 'u1', kind: 'completion', from: 0, to: 100 })
  })

  it('droppedAfter defaults to false for all real entries', () => {
    const updates = [
      makeUpdate({ id: 'u1', percentage: 50, loggedAt: new Date('2025-01-01') }),
      makeUpdate({ id: 'u2', isCompletion: true, loggedAt: new Date('2025-06-01') }),
    ]
    const graph = computeRunsGraph(updates, [])
    expect(graph.every((e) => e.droppedAfter === false)).toBe(true)
  })
})

// ─────────────────────────────────────────────
// Ordering
// ─────────────────────────────────────────────

describe('computeRunsGraph — ordering', () => {
  it('orders by explicit date oldest-first', () => {
    const updates = [
      makeUpdate({ id: 'u3', percentage: 90, date: new Date('2025-12-01') }),
      makeUpdate({ id: 'u1', percentage: 40, date: new Date('2025-01-01') }),
      makeUpdate({ id: 'u2', percentage: 70, date: new Date('2025-06-01') }),
    ]
    const graph = computeRunsGraph(updates, [])
    expect(graph.map((e) => e.progressUpdateId)).toEqual(['u1', 'u2', 'u3'])
  })

  it('falls back to loggedAt when date is null', () => {
    const updates = [
      makeUpdate({ id: 'u2', percentage: 70, date: null, loggedAt: new Date('2025-06-01') }),
      makeUpdate({ id: 'u1', percentage: 40, date: null, loggedAt: new Date('2025-01-01') }),
    ]
    const graph = computeRunsGraph(updates, [])
    expect(graph.map((e) => e.progressUpdateId)).toEqual(['u1', 'u2'])
  })

  it('date takes priority over loggedAt', () => {
    // u1 was logged later but its explicit date is earlier
    const updates = [
      makeUpdate({ id: 'u1', percentage: 40, date: new Date('2025-01-01'), loggedAt: new Date('2025-12-01') }),
      makeUpdate({ id: 'u2', percentage: 70, date: new Date('2025-06-01'), loggedAt: new Date('2025-02-01') }),
    ]
    const graph = computeRunsGraph(updates, [])
    expect(graph.map((e) => e.progressUpdateId)).toEqual(['u1', 'u2'])
  })
})

// ─────────────────────────────────────────────
// Drop-merge rule
// ─────────────────────────────────────────────

describe('computeRunsGraph — drop-merge rule', () => {
  it('drop with no worstFail → flags most recent prior entry, no synthetic bar', () => {
    const updates = [
      makeUpdate({ id: 'u1', percentage: 60, loggedAt: new Date('2025-01-01') }),
    ]
    const drops = [drop({ droppedAt: new Date('2025-03-01'), worstFail: null })]
    const graph = computeRunsGraph(updates, drops)
    expect(graph).toHaveLength(1)
    expect(graph[0]).toMatchObject({ progressUpdateId: 'u1', droppedAfter: true })
  })

  it('drop with worstFail equal to prior entry → flags prior entry, no synthetic bar', () => {
    const updates = [
      makeUpdate({ id: 'u1', percentage: 72, loggedAt: new Date('2025-01-01') }),
    ]
    const drops = [drop({ droppedAt: new Date('2025-03-01'), worstFail: 72 })]
    const graph = computeRunsGraph(updates, drops)
    expect(graph).toHaveLength(1)
    expect(graph[0]).toMatchObject({ progressUpdateId: 'u1', to: 72, droppedAfter: true })
  })

  it('drop with distinct worstFail → emits synthetic flagged bar', () => {
    const updates = [
      makeUpdate({ id: 'u1', percentage: 60, loggedAt: new Date('2025-01-01') }),
    ]
    const drops = [drop({ droppedAt: new Date('2025-03-01'), worstFail: 75 })]
    const graph = computeRunsGraph(updates, drops)
    expect(graph).toHaveLength(2)
    // Original entry is NOT flagged — the synthetic bar carries droppedAfter
    expect(graph[0]).toMatchObject({ progressUpdateId: 'u1', to: 60, droppedAfter: false })
    // Synthetic bar
    expect(graph[1]).toMatchObject({
      progressUpdateId: null,
      kind: 'from_zero',
      from: 0,
      to: 75,
      droppedAfter: true,
    })
  })

  it('synthetic bar carries the drop date and dateUncertain=false', () => {
    const updates = [makeUpdate({ id: 'u1', percentage: 50, loggedAt: new Date('2025-01-01') })]
    const drops = [drop({ droppedAt: new Date('2025-05-15T00:00:00Z'), worstFail: 80 })]
    const graph = computeRunsGraph(updates, drops)
    expect(graph[1]?.date).toBe('2025-05-15T00:00:00.000Z')
    expect(graph[1]?.dateUncertain).toBe(false)
  })

  it('drop with no prior progress entries → no output entry', () => {
    const drops = [drop({ droppedAt: new Date('2025-03-01'), worstFail: 60 })]
    const graph = computeRunsGraph([], drops)
    expect(graph).toHaveLength(0)
  })

  // ── multiple drops ──────────────────────────────────────────────────────────

  it('multiple drops: each flags the correct preceding entry', () => {
    const updates = [
      makeUpdate({ id: 'u1', percentage: 55, loggedAt: new Date('2025-01-01') }),
      // Drop D1 falls between u1 and u2 in time
      makeUpdate({ id: 'u2', percentage: 70, loggedAt: new Date('2025-06-01') }),
      // Drop D2 falls after u2
    ]
    const drops = [
      drop({ droppedAt: new Date('2025-03-01'), worstFail: null }),  // D1 → flag u1
      drop({ droppedAt: new Date('2025-09-01'), worstFail: null }),  // D2 → flag u2
    ]
    const graph = computeRunsGraph(updates, drops)
    expect(graph).toHaveLength(2)
    expect(graph[0]).toMatchObject({ progressUpdateId: 'u1', droppedAfter: true })
    expect(graph[1]).toMatchObject({ progressUpdateId: 'u2', droppedAfter: true })
  })

  it('multiple drops: second drop with distinct worstFail emits synthetic bar after its preceding entry', () => {
    const updates = [
      makeUpdate({ id: 'u1', percentage: 55, loggedAt: new Date('2025-01-01') }),
      makeUpdate({ id: 'u2', percentage: 70, loggedAt: new Date('2025-06-01') }),
    ]
    const drops = [
      drop({ droppedAt: new Date('2025-03-01'), worstFail: null }),  // D1 → flag u1
      drop({ droppedAt: new Date('2025-09-01'), worstFail: 85 }),    // D2 → synthetic bar after u2
    ]
    const graph = computeRunsGraph(updates, drops)
    // u1 (flagged), u2 (not flagged), synthetic bar from D2
    expect(graph).toHaveLength(3)
    expect(graph[0]).toMatchObject({ progressUpdateId: 'u1', droppedAfter: true })
    expect(graph[1]).toMatchObject({ progressUpdateId: 'u2', droppedAfter: false })
    expect(graph[2]).toMatchObject({ progressUpdateId: null, to: 85, droppedAfter: true })
  })

  it('multiple drops: first drop with distinct worstFail, second flags the real prior entry', () => {
    const updates = [
      makeUpdate({ id: 'u1', percentage: 55, loggedAt: new Date('2025-01-01') }),
      makeUpdate({ id: 'u2', percentage: 70, loggedAt: new Date('2025-06-01') }),
    ]
    const drops = [
      drop({ droppedAt: new Date('2025-03-01'), worstFail: 65 }),   // D1 → synthetic bar (65 != 55)
      drop({ droppedAt: new Date('2025-09-01'), worstFail: null }), // D2 → flag u2 (the last real entry)
    ]
    const graph = computeRunsGraph(updates, drops)
    // u1, synthetic bar from D1, u2 (flagged by D2)
    expect(graph).toHaveLength(3)
    expect(graph[0]).toMatchObject({ progressUpdateId: 'u1', droppedAfter: false })
    expect(graph[1]).toMatchObject({ progressUpdateId: null, to: 65, droppedAfter: true })
    expect(graph[2]).toMatchObject({ progressUpdateId: 'u2', droppedAfter: true })
  })

  it('drop with null droppedAt goes last in timeline', () => {
    const updates = [
      makeUpdate({ id: 'u1', percentage: 60, loggedAt: new Date('2025-01-01') }),
      makeUpdate({ id: 'u2', percentage: 80, loggedAt: new Date('2025-12-01') }),
    ]
    const drops = [drop({ droppedAt: null, worstFail: null })]
    const graph = computeRunsGraph(updates, drops)
    // Both updates come before the null-dated drop, so u2 (last real entry) is flagged
    expect(graph).toHaveLength(2)
    expect(graph[0]).toMatchObject({ progressUpdateId: 'u1', droppedAfter: false })
    expect(graph[1]).toMatchObject({ progressUpdateId: 'u2', droppedAfter: true })
  })
})

// ─────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────

describe('computeRunsGraph — edge cases', () => {
  it('returns empty array for no updates and no drops', () => {
    expect(computeRunsGraph([], [])).toEqual([])
  })

  it('no drops: all droppedAfter=false', () => {
    const updates = [
      makeUpdate({ id: 'u1', percentage: 60, loggedAt: new Date('2025-01-01') }),
      makeUpdate({ id: 'u2', isCompletion: true, loggedAt: new Date('2025-06-01') }),
    ]
    const graph = computeRunsGraph(updates, [])
    expect(graph.every((e) => !e.droppedAfter)).toBe(true)
  })

  it('completion followed by nothing: to=100, kind=completion, droppedAfter=false', () => {
    const u = makeUpdate({ id: 'u1', isCompletion: true, loggedAt: new Date('2025-06-01') })
    const [entry] = computeRunsGraph([u], [])
    expect(entry).toMatchObject({ kind: 'completion', from: 0, to: 100, droppedAfter: false })
  })
})
