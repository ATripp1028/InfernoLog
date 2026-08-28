import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { MeData, RatingCategory } from '@/lib/api/me'
import { stubMutation, stubQuery } from '@/utils/testUtils'
import type { LevelPageData } from '@/lib/api/levelPage'
import { levelPageData, levelMeta, progressUpdate } from './fixtures'

vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/api/me', () => ({ useMe: vi.fn() }))
vi.mock('@/lib/api/levelPage', () => ({ useEditProgress: vi.fn() }))
vi.mock('@/lib/api/logging', () => ({ useResolveLevel: vi.fn() }))
vi.mock('@/lib/timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/timezone')>()),
  getViewerTimezone: () => 'America/New_York',
}))

const { toast } = await import('@/components/generic/sonner')
const { useMe } = await import('@/lib/api/me')
const { useEditProgress } = await import('@/lib/api/levelPage')
const { useResolveLevel } = await import('@/lib/api/logging')
const { useEditLevelModal } = await import('../useEditLevelModal')

const category = (id: string, weight = 1): RatingCategory =>
  ({ id, name: id, weight }) as RatingCategory

const meData = (overrides: Partial<MeData> = {}) =>
  ({
    ratingMode: 'SIMPLE',
    ratingCategories: [],
    ...overrides,
  }) as MeData

let editMutate: ReturnType<typeof vi.fn>
let resolveMutate: ReturnType<typeof vi.fn>
let onClose: Mock<() => void>

beforeEach(() => {
  editMutate = vi.fn()
  resolveMutate = vi.fn()
  onClose = vi.fn<() => void>()
  vi.mocked(useEditProgress).mockReturnValue(
    stubMutation({ mutate: editMutate })
  )
  vi.mocked(useResolveLevel).mockReturnValue(
    stubMutation({ mutate: resolveMutate })
  )
  vi.mocked(useMe).mockReturnValue(stubQuery<MeData>({ data: meData() }))
})

function render(
  opts: {
    data?: LevelPageData
    scale?: 'ZERO_TO_TEN' | 'ZERO_TO_HUNDRED'
    open?: boolean
  } = {}
) {
  const data = opts.data ?? levelPageData()
  const view = renderHook(
    ({ open }: { open: boolean }) =>
      useEditLevelModal({
        open,
        onClose,
        data,
        levelId: '128',
        scale: opts.scale ?? 'ZERO_TO_HUNDRED',
      }),
    { initialProps: { open: opts.open ?? true } }
  )
  return { ...view, data }
}

/** The payload handed to the edit mutation by the most recent save. */
const saved = () => editMutate.mock.calls[0]![0] as Record<string, unknown>

describe('useEditLevelModal', () => {
  it('waits for the rating config before declaring itself ready', () => {
    vi.mocked(useMe).mockReturnValue(stubQuery<MeData>({ data: undefined }))

    expect(render().result.current.ready).toBe(false)
  })

  describe('seeding the form', () => {
    it('reads the level fields off the payload', () => {
      const { result } = render({
        data: levelPageData({
          levelNotes: 'tough one',
          worstFail: 94,
          userGddlTier: 35,
          coinsCollected: 2,
          visibility: 'PRIVATE',
        }),
      })

      expect(result.current.form).toMatchObject({
        levelNotes: 'tough one',
        worstFail: '94',
        userGddlTier: '35',
        coinsCollected: 2,
        visibility: 'PRIVATE',
      })
    })

    it('blanks the numeric fields that were never set', () => {
      const { result } = render()

      expect(result.current.form.worstFail).toBe('')
      expect(result.current.form.userGddlTier).toBe('')
      expect(result.current.form.coinsCollected).toBe(0)
      expect(result.current.form.levelNotes).toBe('')
    })

    // Ratings are stored 0-100 internally and edited in the user's units.
    it('converts a stored rating into display units', () => {
      const { result } = render({
        data: levelPageData({ simpleRating: 85 }),
        scale: 'ZERO_TO_TEN',
      })

      expect(result.current.form.simpleRating).toBe(8.5)
    })

    it('leaves a rating in internal units on the 0-100 scale', () => {
      const { result } = render({ data: levelPageData({ simpleRating: 85 }) })

      expect(result.current.form.simpleRating).toBe(85)
    })

    it('seeds a slot for every category, scored or not', () => {
      vi.mocked(useMe).mockReturnValue(
        stubQuery<MeData>({
          data: meData({
            ratingMode: 'WEIGHTED',
            ratingCategories: [category('gameplay'), category('design')],
          }),
        })
      )
      const { result } = render({
        data: levelPageData({
          ratingScores: [{ categoryId: 'gameplay', score: 80 }],
        }),
      })

      expect(result.current.form.ratingScores).toEqual({
        gameplay: 80,
        design: null,
      })
    })

    it('defaults the worst-fail zone to the viewer’s own', () => {
      const { result } = render()

      expect(result.current.form.worstFailTimezone).toBe('America/New_York')
    })

    it('keeps the zone a worst fail was already recorded in', () => {
      const { result } = render({
        data: levelPageData({
          worstFailDate: '2026-03-14T18:00:00.000Z',
          worstFailDateTimezone: 'Asia/Tokyo',
        }),
      })

      expect(result.current.form.worstFailTimezone).toBe('Asia/Tokyo')
    })

    // Re-seeding on every `data` change would wipe whatever the user was
    // mid-typing whenever a background refetch landed.
    it('does not re-seed when the modal is already open', () => {
      const { result } = render()
      act(() => result.current.patch({ levelNotes: 'mid-edit' }))

      vi.mocked(useMe).mockReturnValue(stubQuery<MeData>({ data: meData() }))

      expect(result.current.form.levelNotes).toBe('mid-edit')
    })

    it('re-seeds when the modal reopens', () => {
      const { result, rerender } = render({
        data: levelPageData({ levelNotes: 'stored' }),
      })
      act(() => result.current.patch({ levelNotes: 'mid-edit' }))

      rerender({ open: false })
      rerender({ open: true })

      expect(result.current.form.levelNotes).toBe('stored')
    })
  })

  // The anchor is resolved from the level's status, not from whichever entry
  // happens to be selected — this modal has no entry selection at all.
  describe('the worst-fail "same day" anchor', () => {
    it('anchors a completed level to its completion', () => {
      const { result } = render({
        data: levelPageData({
          status: 'COMPLETED',
          progressUpdates: [
            progressUpdate({ kind: 'PROGRESS' }),
            progressUpdate({ kind: 'COMPLETION' }),
          ],
        }),
      })

      expect(result.current.hasWorstFailAnchor).toBe(true)
    })

    it('anchors a dropped level to its most recent drop', () => {
      const { result } = render({
        data: levelPageData({
          status: 'DROPPED',
          progressUpdates: [progressUpdate({ kind: 'DROP' })],
        }),
      })

      expect(result.current.hasWorstFailAnchor).toBe(true)
    })

    it('offers no anchor on a level still in progress', () => {
      const { result } = render({
        data: levelPageData({
          status: 'IN_PROGRESS',
          progressUpdates: [progressUpdate({ kind: 'PROGRESS' })],
        }),
      })

      expect(result.current.hasWorstFailAnchor).toBe(false)
    })

    it('offers no anchor when the matching entry is missing', () => {
      const { result } = render({
        data: levelPageData({
          status: 'COMPLETED',
          progressUpdates: [progressUpdate({ kind: 'PROGRESS' })],
        }),
      })

      expect(result.current.hasWorstFailAnchor).toBe(false)
    })
  })

  describe('conditional sections', () => {
    it('shows the completion-only fields for a beaten level', () => {
      const { result } = render({
        data: levelPageData({ status: 'COMPLETED' }),
      })

      expect(result.current.isCompleted).toBe(true)
    })

    it.each([
      ['a level with coins', 3, true],
      ['a level with none', 0, false],
      ['a level whose coin count is unknown', null, false],
    ])('reports %s', (_label, coins, expected) => {
      const { result } = render({
        data: levelPageData({ level: levelMeta({ coins }) }),
      })

      expect(result.current.hasCoins).toBe(expected)
    })
  })

  describe('the community tier hint', () => {
    it('asks for a suggestion on a completed level', () => {
      render({ data: levelPageData({ status: 'COMPLETED' }) })

      expect(resolveMutate).toHaveBeenCalledWith('128', expect.anything())
    })

    it.each(['IN_PROGRESS', 'DROPPED'] as const)(
      'asks for nothing on a %s level',
      (status) => {
        render({ data: levelPageData({ status }) })

        expect(resolveMutate).not.toHaveBeenCalled()
      }
    )

    it('surfaces the suggestion once it lands', () => {
      const { result } = render({
        data: levelPageData({ status: 'COMPLETED' }),
      })

      const { onSuccess } = resolveMutate.mock.calls[0]![1]
      act(() => onSuccess({ suggestedGddlTier: 35 }))

      expect(result.current.suggestedGddlTier).toBe(35)
    })

    it('asks for nothing while the modal is closed', () => {
      render({ data: levelPageData({ status: 'COMPLETED' }), open: false })

      expect(resolveMutate).not.toHaveBeenCalled()
    })
  })

  describe('validation', () => {
    it('accepts a tier inside the bound', () => {
      const { result } = render()
      act(() => result.current.patch({ userGddlTier: '35' }))

      expect(result.current.gddlTierError).toBeNull()
    })

    it('rejects a tier over the bound', () => {
      const { result } = render()
      act(() => result.current.patch({ userGddlTier: '999999' }))

      expect(result.current.gddlTierError).not.toBeNull()
    })
  })

  describe('saving', () => {
    it('sends the level-scoped fields', () => {
      const { result } = render()
      act(() =>
        result.current.patch({
          levelNotes: 'tough',
          worstFail: '94',
          visibility: 'PRIVATE',
        })
      )

      act(() => result.current.handleSave())

      expect(saved()).toMatchObject({
        levelNotes: 'tough',
        worstFail: 94,
        visibility: 'PRIVATE',
      })
    })

    it('sends null for fields the user cleared', () => {
      const { result } = render({
        data: levelPageData({ levelNotes: 'was set', worstFail: 90 }),
      })
      act(() => result.current.patch({ levelNotes: '', worstFail: '' }))

      act(() => result.current.handleSave())

      expect(saved().levelNotes).toBeNull()
      expect(saved().worstFail).toBeNull()
    })

    it('converts a simple rating back to internal units', () => {
      const { result } = render({ scale: 'ZERO_TO_TEN' })
      act(() => result.current.patch({ simpleRating: 8.5 }))

      act(() => result.current.handleSave())

      expect(saved().simpleRating).toBe(85)
      expect(saved().ratingScores).toBeUndefined()
    })

    it('sends per-category scores in weighted mode, skipping unscored ones', () => {
      vi.mocked(useMe).mockReturnValue(
        stubQuery<MeData>({
          data: meData({
            ratingMode: 'WEIGHTED',
            ratingCategories: [category('gameplay'), category('design')],
          }),
        })
      )
      const { result } = render({ scale: 'ZERO_TO_TEN' })
      act(() =>
        result.current.patch({ ratingScores: { gameplay: 8, design: null } })
      )

      act(() => result.current.handleSave())

      expect(saved().ratingScores).toEqual([
        { categoryId: 'gameplay', score: 80 },
      ])
      expect(saved().simpleRating).toBeUndefined()
    })

    // The tier and coin fields only exist for a beaten level, so they must
    // not be sent — and silently cleared — for one that is not.
    it('omits the completion-only fields for an unbeaten level', () => {
      const { result } = render({
        data: levelPageData({ status: 'IN_PROGRESS' }),
      })

      act(() => result.current.handleSave())

      expect(saved().userGddlTier).toBeUndefined()
      expect(saved().coinsCollected).toBeUndefined()
    })

    it('sends the tier for a beaten level', () => {
      const { result } = render({
        data: levelPageData({ status: 'COMPLETED' }),
      })
      act(() => result.current.patch({ userGddlTier: '35' }))

      act(() => result.current.handleSave())

      expect(saved().userGddlTier).toBe(35)
    })

    it('sends coins only for a beaten level that has any', () => {
      const withCoins = render({
        data: levelPageData({
          status: 'COMPLETED',
          level: levelMeta({ coins: 3 }),
        }),
      })
      act(() => withCoins.result.current.patch({ coinsCollected: 2 }))
      act(() => withCoins.result.current.handleSave())
      expect(saved().coinsCollected).toBe(2)

      editMutate.mockClear()
      const noCoins = render({
        data: levelPageData({
          status: 'COMPLETED',
          level: levelMeta({ coins: 0 }),
        }),
      })
      act(() => noCoins.result.current.handleSave())
      expect(saved().coinsCollected).toBeUndefined()
    })

    describe('the worst-fail date', () => {
      it('composes the entered date, time, and zone', () => {
        const { result } = render()
        act(() =>
          result.current.patch({
            worstFailSameDay: false,
            worstFailDate: '2026-03-14',
            worstFailTime: '18:30',
            worstFailTimezone: 'UTC',
          })
        )

        act(() => result.current.handleSave())

        expect(saved().worstFailDate).toBe('2026-03-14T18:30:00.000Z')
        expect(saved().worstFailDateTimezone).toBe('UTC')
      })

      it('sends a bare date with no zone when no time was entered', () => {
        const { result } = render()
        act(() =>
          result.current.patch({
            worstFailSameDay: false,
            worstFailDate: '2026-03-14',
            worstFailTime: '',
          })
        )

        act(() => result.current.handleSave())

        expect(saved().worstFailDate).toBe('2026-03-14')
        expect(saved().worstFailDateTimezone).toBeNull()
      })

      // A DST-skipped time has no instant to store, so the whole save is
      // abandoned rather than writing something wrong.
      it('abandons the save for a time daylight saving skipped', () => {
        const { result } = render()
        act(() =>
          result.current.patch({
            worstFailSameDay: false,
            worstFailDate: '2026-03-08',
            worstFailTime: '02:30',
            worstFailTimezone: 'America/New_York',
          })
        )

        act(() => result.current.handleSave())

        expect(editMutate).not.toHaveBeenCalled()
      })

      // Nudged a second earlier than the anchor so the two events don't
      // collide at the minute-level precision the timeline displays.
      it('places a "same day" worst fail just before its anchor', () => {
        const { result } = render({
          data: levelPageData({
            status: 'COMPLETED',
            progressUpdates: [
              progressUpdate({
                kind: 'COMPLETION',
                date: '2026-03-14T18:30:00.000Z',
                dateTimezone: 'UTC',
              }),
            ],
          }),
        })
        act(() => result.current.patch({ worstFailSameDay: true }))

        act(() => result.current.handleSave())

        expect(saved().worstFailDate).toBe('2026-03-14T18:29:59.000Z')
        expect(saved().worstFailDateTimezone).toBe('UTC')
      })

      it('copies a zone-less anchor date across as-is', () => {
        const { result } = render({
          data: levelPageData({
            status: 'COMPLETED',
            progressUpdates: [
              progressUpdate({
                kind: 'COMPLETION',
                date: '2026-03-14',
                dateTimezone: null,
              }),
            ],
          }),
        })
        act(() => result.current.patch({ worstFailSameDay: true }))

        act(() => result.current.handleSave())

        expect(saved().worstFailDate).toBe('2026-03-14')
        expect(saved().worstFailDateTimezone).toBeNull()
      })
    })

    it('confirms and closes on success', () => {
      const { result } = render()

      act(() => result.current.handleSave())
      const { onSuccess } = editMutate.mock.calls[0]![1]
      act(() => onSuccess())

      expect(toast.success).toHaveBeenCalledWith('Changes saved')
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('reports a failure and stays open', () => {
      const { result } = render()

      act(() => result.current.handleSave())
      const { onError } = editMutate.mock.calls[0]![1]
      act(() => onError())

      expect(toast.error).toHaveBeenCalledWith('Failed to save changes')
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  it('names the level, falling back to its id', () => {
    expect(
      render({
        data: levelPageData({ level: levelMeta({ name: 'Bloodbath' }) }),
      }).result.current.levelName
    ).toBe('Bloodbath')

    expect(
      render({
        data: levelPageData({
          level: levelMeta({ name: null, inGameId: '999' }),
        }),
      }).result.current.levelName
    ).toBe('Level #999')
  })
})
