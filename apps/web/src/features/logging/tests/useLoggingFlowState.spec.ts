import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FlowPath } from '../types'
import { useLoggingFlowState } from '../useLoggingFlowState'
import { existingCompletion, level } from './fixtures'

const render = () => renderHook(() => useLoggingFlowState())

/** Opens the flow on a path and resolves a level into it. */
const opened = (path: FlowPath = 'completion') => {
  const view = render()
  act(() => view.result.current.open(path))
  return view
}

const resolved = (overrides: Record<string, unknown> = {}) => ({
  level: level(),
  existingCompletion: null,
  suggestedGddlTier: null,
  ...overrides,
})

describe('useLoggingFlowState', () => {
  describe('opening and closing', () => {
    it('starts closed, on no path', () => {
      const { result } = render()

      expect(result.current.isOpen).toBe(false)
      expect(result.current.path).toBeNull()
      expect(result.current.level).toBeNull()
    })

    it.each(['completion', 'progress', 'drop'] as const)(
      'opens on the %s path at the find step',
      (path) => {
        const { result } = render()

        act(() => result.current.open(path))

        expect(result.current.isOpen).toBe(true)
        expect(result.current.path).toBe(path)
        expect(result.current.step).toBe('find')
      }
    )

    it('closes back to the opening state', () => {
      const { result } = opened()
      act(() => result.current.patchDraft({ notes: 'half typed' }))

      act(() => result.current.close())

      expect(result.current.isOpen).toBe(false)
      expect(result.current.path).toBeNull()
      expect(result.current.draft.notes).toBe('')
    })

    // Reopening must never inherit the previous run's answers.
    it('starts a fresh draft on every open', () => {
      const { result } = opened()
      act(() => result.current.patchDraft({ notes: 'from last time' }))

      act(() => result.current.open('completion'))

      expect(result.current.draft.notes).toBe('')
    })

    it('clears a resolved level when reopened', () => {
      const { result } = opened()
      act(() => result.current.applyResolved(resolved() as never))

      act(() => result.current.open('progress'))

      expect(result.current.level).toBeNull()
      expect(result.current.existingCompletion).toBeNull()
    })
  })

  // Opening from a level page or list row skips the find step — the level is
  // already known, so the flow goes straight to resolving it.
  describe('opening for an edit', () => {
    it('lands on the resolving step with the level pending', () => {
      const { result } = render()

      act(() => result.current.openForEdit('128', 'completion'))

      expect(result.current.isOpen).toBe(true)
      expect(result.current.path).toBe('completion')
      expect(result.current.step).toBe('resolving')
      expect(result.current.pendingEditLevelId).toBe('128')
    })

    it('starts a fresh draft, like an ordinary open', () => {
      const { result } = opened()
      act(() => result.current.patchDraft({ notes: 'from last time' }))

      act(() => result.current.openForEdit('128', 'completion'))

      expect(result.current.draft.notes).toBe('')
    })
  })

  describe('the draft', () => {
    it('patches one field, leaving the rest', () => {
      const { result } = opened()

      act(() => result.current.patchDraft({ notes: 'gg' }))
      act(() => result.current.patchDraft({ attempts: '4200' }))

      expect(result.current.draft.notes).toBe('gg')
      expect(result.current.draft.attempts).toBe('4200')
    })

    it('overwrites a field it patches twice', () => {
      const { result } = opened()

      act(() => result.current.patchDraft({ notes: 'first' }))
      act(() => result.current.patchDraft({ notes: 'second' }))

      expect(result.current.draft.notes).toBe('second')
    })
  })

  describe('resolving a level', () => {
    it('stores the level and clears the pending id', () => {
      const { result } = render()
      act(() => result.current.openForEdit('128', 'completion'))

      act(() => result.current.applyResolved(resolved() as never))

      expect(result.current.level).not.toBeNull()
      expect(result.current.pendingEditLevelId).toBeNull()
    })

    // Each path has its own first step; resolving is what hands off to it.
    it.each([
      ['completion', 'c_basics'],
      ['progress', 'p_core'],
      ['drop', 'd_main'],
    ] as const)('advances the %s path to %s', (path, step) => {
      const { result } = opened(path)

      act(() => result.current.applyResolved(resolved() as never))

      expect(result.current.step).toBe(step)
    })

    // "Edit, not replace": a level the user already beat pre-populates the
    // wizard from that completion rather than starting blank.
    it('seeds the draft from an existing completion', () => {
      const { result } = opened('completion')

      act(() =>
        result.current.applyResolved(
          resolved({
            existingCompletion: existingCompletion({
              attempts: 4200,
              notes: 'gg',
            }),
          }) as never
        )
      )

      expect(result.current.draft.attempts).toBe('4200')
      expect(result.current.draft.notes).toBe('gg')
      expect(result.current.existingCompletion).not.toBeNull()
    })

    // Progress and drop are additive events — they never edit the completion,
    // so its values must not leak into their drafts.
    it.each(['progress', 'drop'] as const)(
      'leaves the %s draft alone even when a completion exists',
      (path) => {
        const { result } = opened(path)

        act(() =>
          result.current.applyResolved(
            resolved({
              existingCompletion: existingCompletion({ attempts: 4200 }),
            }) as never
          )
        )

        expect(result.current.draft.attempts).toBe('')
      }
    )

    describe('the suggested GDDL tier', () => {
      it('pre-fills the tier for a new completion', () => {
        const { result } = opened('completion')

        act(() =>
          result.current.applyResolved(
            resolved({ suggestedGddlTier: 24 }) as never
          )
        )

        expect(result.current.draft.userGddlTier).toBe('24')
      })

      it('rounds a fractional community tier', () => {
        const { result } = opened('completion')

        act(() =>
          result.current.applyResolved(
            resolved({ suggestedGddlTier: 23.6 }) as never
          )
        )

        expect(result.current.draft.userGddlTier).toBe('24')
      })

      // The user's own stored opinion wins over the community's — editing an
      // existing completion must not silently overwrite what they logged.
      it('does not overwrite a tier the user already logged', () => {
        const { result } = opened('completion')

        act(() =>
          result.current.applyResolved(
            resolved({
              suggestedGddlTier: 24,
              existingCompletion: existingCompletion({ userGddlTier: 30 }),
            }) as never
          )
        )

        expect(result.current.draft.userGddlTier).toBe('30')
      })

      it('leaves the tier blank when there is no suggestion', () => {
        const { result } = opened('completion')

        act(() =>
          result.current.applyResolved(
            resolved({ suggestedGddlTier: null }) as never
          )
        )

        expect(result.current.draft.userGddlTier).toBe('')
      })
    })
  })

  // When the GD servers cannot be reached, the user types the level in by
  // hand rather than being stuck.
  describe('the manual-entry fallback', () => {
    it('carries the typed id into the manual step', () => {
      const { result } = opened()

      act(() => result.current.goManual('128', null))

      expect(result.current.step).toBe('manual')
      expect(result.current.manualLevelId).toBe('128')
    })

    it('keeps an existing completion found before the failure', () => {
      const { result } = opened()

      act(() => result.current.goManual('128', existingCompletion()))

      expect(result.current.existingCompletion).not.toBeNull()
    })

    it('clears the pending edit id, since the resolve is over', () => {
      const { result } = render()
      act(() => result.current.openForEdit('128', 'completion'))

      act(() => result.current.goManual('128', null))

      expect(result.current.pendingEditLevelId).toBeNull()
    })

    it('advances to the path’s first step once the level is entered', () => {
      const { result } = opened('progress')
      act(() => result.current.goManual('128', null))

      act(() => result.current.applyManualLevel(level()))

      expect(result.current.level).not.toBeNull()
      expect(result.current.step).toBe('p_core')
    })

    // Same edit-in-place rule as the resolved path.
    it('seeds the completion draft from an existing completion', () => {
      const { result } = opened('completion')
      act(() =>
        result.current.goManual('128', existingCompletion({ attempts: 4200 }))
      )

      act(() => result.current.applyManualLevel(level()))

      expect(result.current.draft.attempts).toBe('4200')
    })

    it.each(['progress', 'drop'] as const)(
      'leaves the %s draft alone',
      (path) => {
        const { result } = opened(path)
        act(() =>
          result.current.goManual('128', existingCompletion({ attempts: 4200 }))
        )

        act(() => result.current.applyManualLevel(level()))

        expect(result.current.draft.attempts).toBe('')
      }
    )
  })

  describe('step navigation', () => {
    it('moves to whatever step it is told', () => {
      const { result } = opened()

      act(() => result.current.setStep('c_review'))

      expect(result.current.step).toBe('c_review')
    })

    it('leaves everything else alone', () => {
      const { result } = opened()
      act(() => result.current.patchDraft({ notes: 'gg' }))

      act(() => result.current.setStep('c_review'))

      expect(result.current.draft.notes).toBe('gg')
      expect(result.current.path).toBe('completion')
    })
  })

  // Handed to the ranking page's "Place now" navigation so it can scroll to
  // the entry that was just submitted.
  describe('the last completion', () => {
    it('starts unset', () => {
      expect(render().result.current.lastCompletionLevelProgressId).toBeNull()
    })

    it('records the submitted entry', () => {
      const { result } = opened()

      act(() => result.current.setLastCompletion('progress-1'))

      expect(result.current.lastCompletionLevelProgressId).toBe('progress-1')
    })

    it('survives closing, so the ranking page can still read it', () => {
      const { result } = opened()
      act(() => result.current.setLastCompletion('progress-1'))

      act(() => result.current.setStep('c_success'))

      expect(result.current.lastCompletionLevelProgressId).toBe('progress-1')
    })
  })
})
