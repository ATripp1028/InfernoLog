import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DragEndEvent } from '@dnd-kit/core'
import type { MeData, RatingCategory } from '@/lib/api/me'
import { stubMutation } from '@/utils/testUtils'

vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useUpdateRatingConfig: vi.fn(),
}))

const { toast } = await import('@/components/generic/sonner')
const { useUpdateRatingConfig } = await import('@/lib/api/me')
const { ENJOYMENT_KEY, useRatingConfigEditor } =
  await import('../useRatingConfigEditor')

let updateAsync: ReturnType<typeof vi.fn>

beforeEach(() => {
  updateAsync = vi.fn().mockResolvedValue(undefined)
  vi.mocked(useUpdateRatingConfig).mockReturnValue(
    stubMutation({ mutateAsync: updateAsync })
  )
})

const category = (
  id: string,
  weight: number,
  sortOrder: number,
  name = id
): RatingCategory => ({ id, name, weight, sortOrder }) as RatingCategory

const me = (overrides: Partial<MeData> = {}): MeData =>
  ({
    ratingCategories: [category('gameplay', 1, 0, 'Gameplay')],
    includeEnjoyment: false,
    enjoymentWeight: 0,
    enjoymentSortOrder: 0,
    ...overrides,
  }) as MeData

const render = (data: MeData = me()) =>
  renderHook(
    ({ user }: { user: MeData }) =>
      useRatingConfigEditor(user, { current: null }),
    { initialProps: { user: data } }
  )

/** The payload handed to the update mutation by the most recent save. */
const saved = () => updateAsync.mock.calls[0]![0]

const keys = (result: { current: { visibleItems: { localKey: string }[] } }) =>
  result.current.visibleItems.map((i) => i.localKey)

describe('useRatingConfigEditor', () => {
  describe('building the initial list', () => {
    it('lists the categories in their stored priority order', () => {
      const { result } = render(
        me({
          ratingCategories: [
            category('c', 0.2, 2),
            category('a', 0.5, 0),
            category('b', 0.3, 1),
          ],
        })
      )

      expect(keys(result)).toEqual(['a', 'b', 'c'])
    })

    it('leaves enjoyment out when it is off', () => {
      const { result } = render(me({ includeEnjoyment: false }))

      expect(keys(result)).not.toContain(ENJOYMENT_KEY)
      expect(result.current.includeEnjoyment).toBe(false)
    })

    // Enjoyment shares one priority list with the categories, so its stored
    // sort order interleaves rather than pinning it to an end.
    it('splices enjoyment in at its stored position', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.4, 0), category('b', 0.3, 1)],
          includeEnjoyment: true,
          enjoymentWeight: 0.3,
          enjoymentSortOrder: 1,
        })
      )

      expect(keys(result)).toEqual(['a', ENJOYMENT_KEY, 'b'])
    })

    // A stale sort order — say 99 after categories were deleted — must land
    // somewhere valid rather than off the end.
    it('clamps a stale enjoyment position to the end of the list', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.5, 0)],
          includeEnjoyment: true,
          enjoymentSortOrder: 99,
        })
      )

      expect(keys(result)).toEqual(['a', ENJOYMENT_KEY])
    })

    it('re-seeds when the stored config changes', () => {
      const { result, rerender } = render(me())

      rerender({ user: me({ ratingCategories: [category('other', 1, 0)] }) })

      expect(keys(result)).toEqual(['other'])
    })
  })

  // Weights are summed in integer cents against an exact target, so floating
  // point cannot drift a valid config into invalid.
  describe('the weight sum', () => {
    it('accepts weights summing to exactly one', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.5, 0), category('b', 0.5, 1)],
        })
      )

      expect(result.current.cents).toBe(100)
      expect(result.current.sumValid).toBe(true)
    })

    it('rejects a sum that is short', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.5, 0), category('b', 0.3, 1)],
        })
      )

      expect(result.current.sumValid).toBe(false)
    })

    it('sums thirds without floating-point drift', () => {
      const { result } = render(
        me({
          ratingCategories: [
            category('a', 0.34, 0),
            category('b', 0.33, 1),
            category('c', 0.33, 2),
          ],
        })
      )

      expect(result.current.cents).toBe(100)
      expect(result.current.sumValid).toBe(true)
    })

    // A toggled-off enjoyment row stays in the list to keep its position, so
    // it must not count toward the sum.
    it('excludes a toggled-off enjoyment row', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 1, 0)],
          includeEnjoyment: true,
          enjoymentWeight: 0.5,
          enjoymentSortOrder: 1,
        })
      )
      expect(result.current.sumValid).toBe(false)

      act(() => result.current.handleEnjoymentToggle(false))

      expect(result.current.cents).toBe(100)
      expect(result.current.sumValid).toBe(true)
    })
  })

  describe('name validation', () => {
    it('accepts distinct, non-empty names', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.5, 0), category('b', 0.5, 1)],
        })
      )

      expect(result.current.hasEmptyName).toBe(false)
      expect(result.current.hasDuplicateName).toBe(false)
    })

    it.each(['', '   '])('rejects the blank name %p', (name) => {
      const { result } = render()

      act(() => result.current.renameCategory('gameplay', name))

      expect(result.current.hasEmptyName).toBe(true)
    })

    it('rejects two categories with the same name', () => {
      const { result } = render(
        me({
          ratingCategories: [
            category('a', 0.5, 0, 'Gameplay'),
            category('b', 0.5, 1, 'Design'),
          ],
        })
      )

      act(() => result.current.renameCategory('b', 'Gameplay'))

      expect(result.current.hasDuplicateName).toBe(true)
    })

    // Names are compared case- and whitespace-insensitively, since two
    // categories differing only that way are indistinguishable on screen.
    it.each(['  Gameplay  ', 'GAMEPLAY', 'gameplay'])(
      'treats %p as a duplicate of Gameplay',
      (name) => {
        const { result } = render(
          me({
            ratingCategories: [
              category('a', 0.5, 0, 'Gameplay'),
              category('b', 0.5, 1, 'Design'),
            ],
          })
        )

        act(() => result.current.renameCategory('b', name))

        expect(result.current.hasDuplicateName).toBe(true)
      }
    )

    // Two blanks are an empty-name problem, not a duplicate one — reporting
    // both would show the user two messages for one mistake.
    it('does not also call two blank names duplicates', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.5, 0), category('b', 0.5, 1)],
        })
      )

      act(() => result.current.renameCategory('a', ''))
      act(() => result.current.renameCategory('b', ''))

      expect(result.current.hasEmptyName).toBe(true)
      expect(result.current.hasDuplicateName).toBe(false)
    })
  })

  describe('the dirty and save gates', () => {
    it('starts clean, with nothing to save', () => {
      const { result } = render()

      expect(result.current.dirty).toBe(false)
      expect(result.current.canSave).toBe(false)
    })

    it('becomes dirty on a rename', () => {
      const { result } = render()

      act(() => result.current.renameCategory('gameplay', 'Renamed'))

      expect(result.current.dirty).toBe(true)
      expect(result.current.canSave).toBe(true)
    })

    // Weights are compared at the precision the column stores, so a change
    // finer than that is not a change at all.
    it('ignores a weight change below the stored precision', () => {
      const { result } = render()

      act(() => result.current.setWeight('gameplay', 1.0001))

      expect(result.current.dirty).toBe(false)
    })

    it('withholds save while the weights do not sum', () => {
      const { result } = render()

      act(() => result.current.setWeight('gameplay', 0.5))

      expect(result.current.dirty).toBe(true)
      expect(result.current.canSave).toBe(false)
    })

    it('withholds save while a name is blank', () => {
      const { result } = render()

      act(() => result.current.renameCategory('gameplay', ''))

      expect(result.current.dirty).toBe(true)
      expect(result.current.canSave).toBe(false)
    })

    it('restores the stored config on reset', () => {
      const { result } = render()
      act(() => result.current.renameCategory('gameplay', 'Renamed'))

      act(() => result.current.handleReset())

      expect(result.current.dirty).toBe(false)
    })
  })

  describe('bulk weight actions', () => {
    // The remainder goes to the highest-priority row so the total still hits
    // exactly 100 cents rather than 99.
    it('splits three ways with the remainder on the first row', () => {
      const { result } = render(
        me({
          ratingCategories: [
            category('a', 0.5, 0),
            category('b', 0.3, 1),
            category('c', 0.2, 2),
          ],
        })
      )

      act(() => result.current.handleDistributeEqually())

      expect(result.current.visibleItems.map((i) => i.weight)).toEqual([
        0.34, 0.33, 0.33,
      ])
      expect(result.current.cents).toBe(100)
    })

    it('splits evenly when it divides cleanly', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.9, 0), category('b', 0.1, 1)],
        })
      )

      act(() => result.current.handleDistributeEqually())

      expect(result.current.visibleItems.map((i) => i.weight)).toEqual([
        0.5, 0.5,
      ])
    })

    it('gives a lone row the whole weight', () => {
      const { result } = render(
        me({ ratingCategories: [category('a', 0.2, 0)] })
      )

      act(() => result.current.handleDistributeEqually())

      expect(result.current.cents).toBe(100)
    })

    it('sorts the rows heaviest first', () => {
      const { result } = render(
        me({
          ratingCategories: [
            category('light', 0.2, 0),
            category('heavy', 0.5, 1),
            category('mid', 0.3, 2),
          ],
        })
      )

      act(() => result.current.handleSortByWeight())

      expect(keys(result)).toEqual(['heavy', 'mid', 'light'])
    })

    it('keeps the current order among equal weights', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.5, 0), category('b', 0.5, 1)],
        })
      )

      act(() => result.current.handleSortByWeight())

      expect(keys(result)).toEqual(['a', 'b'])
    })
  })

  describe('the enjoyment toggle', () => {
    // Toggling on with no prior value seeds a usable half rather than a
    // zero the user then has to notice and fix.
    it('seeds a fresh enjoyment row at a half', () => {
      const { result } = render(me({ includeEnjoyment: false }))

      act(() => result.current.handleEnjoymentToggle(true))

      const enjoyment = result.current.visibleItems.find(
        (i) => i.localKey === ENJOYMENT_KEY
      )
      expect(enjoyment?.weight).toBe(0.5)
    })

    // Toggling off and back on must not destroy a weight the user set.
    it('keeps a weight the user had already chosen', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.7, 0)],
          includeEnjoyment: true,
          enjoymentWeight: 0.3,
          enjoymentSortOrder: 1,
        })
      )

      act(() => result.current.handleEnjoymentToggle(false))
      act(() => result.current.handleEnjoymentToggle(true))

      const enjoyment = result.current.visibleItems.find(
        (i) => i.localKey === ENJOYMENT_KEY
      )
      expect(enjoyment?.weight).toBe(0.3)
    })

    // The row stays in the list while hidden so its position survives.
    it('keeps its place across a toggle off and on', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.4, 0), category('b', 0.3, 1)],
          includeEnjoyment: true,
          enjoymentWeight: 0.3,
          enjoymentSortOrder: 1,
        })
      )

      act(() => result.current.handleEnjoymentToggle(false))
      act(() => result.current.handleEnjoymentToggle(true))

      expect(keys(result)).toEqual(['a', ENJOYMENT_KEY, 'b'])
    })
  })

  describe('editing rows', () => {
    it('renames only the row asked for', () => {
      const { result } = render(
        me({
          ratingCategories: [
            category('a', 0.5, 0, 'A'),
            category('b', 0.5, 1, 'B'),
          ],
        })
      )

      act(() => result.current.renameCategory('a', 'Renamed'))

      const names = result.current.visibleItems.map((i) =>
        i.kind === 'category' ? i.name : null
      )
      expect(names).toEqual(['Renamed', 'B'])
    })

    it('adds a blank category at the end', () => {
      const { result } = render()

      act(() => result.current.handleAdd())

      expect(result.current.visibleItems).toHaveLength(2)
      expect(result.current.hasEmptyName).toBe(true)
    })

    it('deletes the row asked for', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.5, 0), category('b', 0.5, 1)],
        })
      )

      act(() => result.current.deleteItem('a'))

      expect(keys(result)).toEqual(['b'])
    })

    it('reorders on drag', () => {
      const { result } = render(
        me({
          ratingCategories: [
            category('a', 0.5, 0),
            category('b', 0.3, 1),
            category('c', 0.2, 2),
          ],
        })
      )

      act(() =>
        result.current.handleDragEnd({
          active: { id: 'a' },
          over: { id: 'c' },
        } as DragEndEvent)
      )

      expect(keys(result)).toEqual(['b', 'c', 'a'])
    })

    it.each([
      ['a drop on itself', { active: { id: 'a' }, over: { id: 'a' } }],
      ['a drop on nothing', { active: { id: 'a' }, over: null }],
      ['an unknown row', { active: { id: 'ghost' }, over: { id: 'a' } }],
    ])('ignores %s', (_label, event) => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.5, 0), category('b', 0.5, 1)],
        })
      )

      act(() => result.current.handleDragEnd(event as DragEndEvent))

      expect(keys(result)).toEqual(['a', 'b'])
    })
  })

  describe('saving', () => {
    const dirtyEditor = () => {
      const view = render(
        me({
          ratingCategories: [
            category('a', 0.6, 0, 'A'),
            category('b', 0.4, 1, 'B'),
          ],
        })
      )
      act(() => view.result.current.renameCategory('a', 'Renamed'))
      return view
    }

    it('sends the categories in their current order', () => {
      const { result } = dirtyEditor()

      act(() => result.current.handleSave())

      expect(saved().categories).toEqual([
        { id: 'a', name: 'Renamed', weight: 0.6 },
        { id: 'b', name: 'B', weight: 0.4 },
      ])
    })

    it('trims the names it sends', () => {
      const { result } = dirtyEditor()
      act(() => result.current.renameCategory('a', '  Spaced  '))

      act(() => result.current.handleSave())

      expect(saved().categories[0].name).toBe('Spaced')
    })

    // A brand-new category has no id yet; sending one would be a lie.
    it('omits the id for a category the server has not seen', () => {
      const { result } = render(
        me({ ratingCategories: [category('a', 0.5, 0)] })
      )
      act(() => result.current.handleAdd())
      act(() =>
        result.current.renameCategory(
          result.current.visibleItems[1]!.localKey,
          'New'
        )
      )
      act(() =>
        result.current.setWeight(result.current.visibleItems[1]!.localKey, 0.5)
      )

      act(() => result.current.handleSave())

      expect(saved().categories[1]).not.toHaveProperty('id')
    })

    it('sends enjoyment’s weight and its place in the list', () => {
      const { result } = render(
        me({
          ratingCategories: [category('a', 0.7, 0)],
          includeEnjoyment: true,
          enjoymentWeight: 0.3,
          enjoymentSortOrder: 1,
        })
      )
      act(() => result.current.renameCategory('a', 'Renamed'))

      act(() => result.current.handleSave())

      expect(saved()).toMatchObject({
        includeEnjoyment: true,
        enjoymentWeight: 0.3,
        enjoymentSortOrder: 1,
      })
    })

    // The row is absent entirely when enjoyment was never enabled, so its
    // position defaults to the end rather than to a negative index.
    it('defaults an absent enjoyment row to the end of the list', () => {
      const { result } = dirtyEditor()

      act(() => result.current.handleSave())

      expect(saved().enjoymentSortOrder).toBe(2)
      expect(saved().enjoymentWeight).toBe(0)
    })

    it('writes nothing while the config is invalid', () => {
      const { result } = render()
      act(() => result.current.setWeight('gameplay', 0.5))

      act(() => result.current.handleSave())

      expect(updateAsync).not.toHaveBeenCalled()
    })

    it('reports a failed save', async () => {
      updateAsync.mockRejectedValue(new Error('Server exploded'))
      const { result } = dirtyEditor()

      await act(async () => result.current.handleSave())

      expect(toast.error).toHaveBeenCalledWith('Server exploded')
    })

    it('falls back to generic copy for a non-Error failure', async () => {
      updateAsync.mockRejectedValue('nope')
      const { result } = dirtyEditor()

      await act(async () => result.current.handleSave())

      expect(toast.error).toHaveBeenCalledWith('Failed to save')
    })
  })
})
