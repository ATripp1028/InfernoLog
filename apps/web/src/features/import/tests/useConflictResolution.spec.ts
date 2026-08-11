import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ImportCheckResponse } from '@/lib/api/import'
import type { GroupResolution } from '../FieldConflictMerge'
import { EMPTY_CHECK_RESULT, type RowResolutions } from '../importWizardModel'
import { useConflictResolution } from '../useConflictResolution'
import { ratingConflict, rowConflict } from './fixtures'

const checkResult = (
  overrides: Partial<ImportCheckResponse> = {}
): ImportCheckResponse => ({ ...EMPTY_CHECK_RESULT, ...overrides })

const resolution = (id: string): Map<string, GroupResolution> =>
  new Map([[id, { resolution: 'overwrite', values: {} }]])

describe('useConflictResolution', () => {
  const render = () => renderHook(() => useConflictResolution())

  describe('storing what the check found', () => {
    it('starts with nothing', () => {
      const { result } = render()

      expect(result.current.completionConflicts).toEqual([])
      expect(result.current.progressConflicts).toEqual([])
      expect(result.current.droppedConflicts).toEqual([])
      expect(result.current.ratingConflicts).toEqual([])
    })

    it('keeps each tab of conflicts as the check returned them', () => {
      const { result } = render()
      const found = checkResult({
        completionConflicts: [rowConflict({ rowIndex: 1 })],
        progressConflicts: [rowConflict({ rowIndex: 2 })],
        droppedConflicts: [rowConflict({ rowIndex: 3 })],
        ratingConflicts: [ratingConflict()],
      })

      act(() => result.current.store(found))

      expect(result.current.completionConflicts).toEqual(
        found.completionConflicts
      )
      expect(result.current.ratingConflicts).toEqual(found.ratingConflicts)
    })

    // store() runs even on the blanket-override path that never shows a
    // resolver, because the rest of the flow still needs the matched ids.
    it('stores without entering the sequence', () => {
      const { result } = render()

      act(() =>
        result.current.store(checkResult({ droppedConflicts: [rowConflict()] }))
      )

      expect(result.current.droppedConflicts).toHaveLength(1)
      expect(result.current.conflictSubStep).toBe('completions')
    })

    it('drops everything on reset', () => {
      const { result } = render()
      act(() =>
        result.current.store(
          checkResult({
            completionConflicts: [rowConflict()],
            ratingConflicts: [ratingConflict()],
          })
        )
      )

      act(() => result.current.reset())

      expect(result.current.completionConflicts).toEqual([])
      expect(result.current.ratingConflicts).toEqual([])
    })
  })

  describe('entering the sequence', () => {
    it('opens on the first tab that has conflicts', () => {
      const { result } = render()

      let first: string | null = null
      act(() => {
        first = result.current.begin(
          checkResult({ droppedConflicts: [rowConflict()] })
        )
      })

      expect(first).toBe('dropped')
      expect(result.current.conflictSubStep).toBe('dropped')
    })

    // Null is what tells the flow to skip resolve-conflicts entirely.
    it('reports nothing to resolve for a clean check', () => {
      const { result } = render()

      let first: string | null = 'unset'
      act(() => {
        first = result.current.begin(checkResult())
      })

      expect(first).toBeNull()
    })

    it('clears resolutions from a previous run', () => {
      const { result } = render()
      const found = checkResult({ completionConflicts: [rowConflict()] })
      act(() => result.current.begin(found))
      act(() => {
        result.current.resolveAndAdvance('completions', resolution('0'))
      })

      act(() => result.current.begin(found))

      expect(result.current.resolutions.completion.size).toBe(0)
    })

    // begin() reads the response it is handed rather than stored state, so a
    // caller can enter the sequence in the same tick the check returns.
    it('does not require store() to have run first', () => {
      const { result } = render()

      let first: string | null = null
      act(() => {
        first = result.current.begin(
          checkResult({ ratingConflicts: [ratingConflict()] })
        )
      })

      expect(first).toBe('ratings')
    })
  })

  describe('walking the sequence', () => {
    /** Enters the sequence with conflicts on the named tabs. */
    const beginWith = (tabs: {
      completions?: boolean
      progress?: boolean
      dropped?: boolean
      ratings?: boolean
    }) => {
      const view = render()
      const found = checkResult({
        completionConflicts: tabs.completions ? [rowConflict()] : [],
        progressConflicts: tabs.progress ? [rowConflict()] : [],
        droppedConflicts: tabs.dropped ? [rowConflict()] : [],
        ratingConflicts: tabs.ratings ? [ratingConflict()] : [],
      })
      act(() => {
        view.result.current.store(found)
        view.result.current.begin(found)
      })
      return view
    }

    it('advances to the next tab that has conflicts', () => {
      const { result } = beginWith({ completions: true, ratings: true })

      act(() => {
        result.current.resolveAndAdvance('completions', resolution('0'))
      })

      expect(result.current.conflictSubStep).toBe('ratings')
    })

    // Empty tabs are skipped, same rule as the top-level wizard steps.
    it('skips the tabs in between that had nothing', () => {
      const { result } = beginWith({ completions: true, dropped: true })

      act(() => {
        result.current.resolveAndAdvance('completions', resolution('0'))
      })

      expect(result.current.conflictSubStep).toBe('dropped')
    })

    it('returns nothing while tabs remain', () => {
      const { result } = beginWith({ completions: true, progress: true })

      let bundle: unknown = 'unset'
      act(() => {
        bundle = result.current.resolveAndAdvance(
          'completions',
          resolution('0')
        )
      })

      expect(bundle).toBeNull()
    })

    it('hands back the full bundle when the last tab is resolved', () => {
      const { result } = beginWith({ ratings: true })

      let bundle: RowResolutions | null = null
      act(() => {
        bundle = result.current.resolveAndAdvance(
          'ratings',
          resolution('128::Gameplay')
        )
      })
      const done = bundle as RowResolutions | null

      expect(Object.keys(done!).sort()).toEqual([
        'completion',
        'dropped',
        'progress',
        'rating',
      ])
      expect(done!.rating.size).toBe(1)
    })

    // The bundle reads its sibling tabs from state — by the time the last
    // handler fires, every earlier tab has been through its own setState.
    it('carries every earlier tab into the final bundle', () => {
      const { result } = beginWith({
        completions: true,
        progress: true,
        ratings: true,
      })

      act(() => {
        result.current.resolveAndAdvance('completions', resolution('c'))
      })
      act(() => {
        result.current.resolveAndAdvance('progress', resolution('p'))
      })

      let bundle: RowResolutions | null = null
      act(() => {
        bundle = result.current.resolveAndAdvance('ratings', resolution('r'))
      })
      const done = bundle as RowResolutions | null

      expect([...done!.completion.keys()]).toEqual(['c'])
      expect([...done!.progress.keys()]).toEqual(['p'])
      expect([...done!.rating.keys()]).toEqual(['r'])
      expect(done!.dropped.size).toBe(0)
    })

    it('exposes the bundle so far between tabs', () => {
      const { result } = beginWith({ completions: true, progress: true })

      act(() => {
        result.current.resolveAndAdvance('completions', resolution('c'))
      })

      expect([...result.current.resolutions.completion.keys()]).toEqual(['c'])
      expect(result.current.resolutions.progress.size).toBe(0)
    })

    it('completes immediately when only one tab had conflicts', () => {
      const { result } = beginWith({ completions: true })

      let bundle: unknown = null
      act(() => {
        bundle = result.current.resolveAndAdvance(
          'completions',
          resolution('0')
        )
      })

      expect(bundle).not.toBeNull()
    })

    it('walks all four tabs in the declared order', () => {
      const { result } = beginWith({
        completions: true,
        progress: true,
        dropped: true,
        ratings: true,
      })
      const visited = [result.current.conflictSubStep]

      for (const tab of ['completions', 'progress', 'dropped'] as const) {
        act(() => {
          result.current.resolveAndAdvance(tab, resolution(tab))
        })
        visited.push(result.current.conflictSubStep)
      }

      expect(visited).toEqual(['completions', 'progress', 'dropped', 'ratings'])
    })
  })

  // The flow's callbacks take this object as a dependency, so a fresh
  // identity every render would make their useCallbacks meaningless.
  it('keeps a stable identity across unrelated re-renders', () => {
    const { result, rerender } = render()
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })

  it('changes identity when its state actually changes', () => {
    const { result } = render()
    const first = result.current

    act(() =>
      result.current.store(
        checkResult({ completionConflicts: [rowConflict()] })
      )
    )

    expect(result.current).not.toBe(first)
  })
})
