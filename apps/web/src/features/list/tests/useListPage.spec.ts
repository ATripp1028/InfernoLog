import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MeData, RatingCategory } from '@/lib/api/me'
import type { ListPreset } from '@/lib/api/presets'
import { queryWrapper, stubMutation, stubQuery } from '@/utils/testUtils'
import { DEFAULT_SORTS, defaultViewConfig } from '../presets'
import { ATTEMPTS_DOMAIN, DATE_MIN_MS, type ListItem } from '../types'
import { entry, filters, item, level } from './fixtures'

const { navigate, openForEdit } = vi.hoisted(() => ({
  navigate: vi.fn(),
  openForEdit: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ href: '/list' }),
}))
vi.mock('@/features/logging/LoggingFlowProvider', () => ({
  useLoggingFlow: () => ({ openForEdit }),
}))
vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/useMediaQuery', () => ({ useMediaQuery: vi.fn(() => true) }))
vi.mock('@/lib/presetCookie', () => ({
  getPresetCookie: vi.fn(() => null),
  setPresetCookie: vi.fn(),
}))
vi.mock('@/lib/api/me', () => ({ useMe: vi.fn() }))
vi.mock('@/lib/api/list', () => ({
  useMyProgress: vi.fn(),
  useDeleteProgress: vi.fn(),
}))
vi.mock('@/lib/api/levelPage', () => ({ useLevelPage: vi.fn() }))
vi.mock('@/lib/api/presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/presets')>()),
  useListPresets: vi.fn(),
  useCreatePreset: vi.fn(),
  useUpdatePreset: vi.fn(),
  useDeletePreset: vi.fn(),
}))

const { toast } = await import('@/components/generic/sonner')
const { getPresetCookie, setPresetCookie } = await import('@/lib/presetCookie')
const { useMediaQuery } = await import('@/lib/useMediaQuery')
const { useMe } = await import('@/lib/api/me')
const { useMyProgress, useDeleteProgress } = await import('@/lib/api/list')
const { useLevelPage } = await import('@/lib/api/levelPage')
const { useListPresets, useCreatePreset, useUpdatePreset, useDeletePreset } =
  await import('@/lib/api/presets')
const { useListPage } = await import('../useListPage')

const category = (id: string, sortOrder = 0, name = id): RatingCategory =>
  ({ id, name, sortOrder }) as RatingCategory

const meData = (overrides: Partial<MeData> = {}) =>
  ({
    id: 'user-1',
    ratingMode: 'SIMPLE',
    ratingCategories: [],
    ...overrides,
  }) as MeData

const preset = (overrides: Partial<ListPreset> = {}): ListPreset =>
  ({
    id: 'p1',
    name: 'Extremes',
    description: null,
    color: 'blue',
    ...defaultViewConfig(),
    ...overrides,
  }) as ListPreset

let createMutate: ReturnType<typeof vi.fn>
let updateMutate: ReturnType<typeof vi.fn>
let deletePresetMutate: ReturnType<typeof vi.fn>
let deleteProgressMutate: ReturnType<typeof vi.fn>

beforeEach(() => {
  createMutate = vi.fn()
  updateMutate = vi.fn()
  deletePresetMutate = vi.fn()
  deleteProgressMutate = vi.fn()
  vi.mocked(useCreatePreset).mockReturnValue(
    stubMutation({ mutate: createMutate })
  )
  vi.mocked(useUpdatePreset).mockReturnValue(
    stubMutation({ mutate: updateMutate })
  )
  vi.mocked(useDeletePreset).mockReturnValue(
    stubMutation({ mutate: deletePresetMutate })
  )
  vi.mocked(useDeleteProgress).mockReturnValue(
    stubMutation({ mutate: deleteProgressMutate })
  )
  vi.mocked(useMe).mockReturnValue(stubQuery<MeData>({ data: meData() }))
  vi.mocked(useMyProgress).mockReturnValue(stubQuery<ListItem[]>({ data: [] }))
  vi.mocked(useListPresets).mockReturnValue(
    stubQuery<ListPreset[]>({ data: [] })
  )
  vi.mocked(useLevelPage).mockReturnValue(
    stubQuery({ data: undefined }) as never
  )
  vi.mocked(getPresetCookie).mockReturnValue(null)
  // Re-set every test: clearMocks wipes call history but leaves a
  // mockReturnValue in place, so the narrow-viewport test below would
  // otherwise leak `false` into everything after it.
  vi.mocked(useMediaQuery).mockReturnValue(true)
})

function render() {
  const { wrapper } = queryWrapper()
  return renderHook(() => useListPage(), { wrapper })
}

const withItems = (items: ListItem[]) =>
  vi
    .mocked(useMyProgress)
    .mockReturnValue(stubQuery<ListItem[]>({ data: items }))

const withPresets = (presets: ListPreset[]) =>
  vi
    .mocked(useListPresets)
    .mockReturnValue(stubQuery<ListPreset[]>({ data: presets }))

describe('useListPage', () => {
  describe('the load gate', () => {
    it.each([
      [
        'the viewer',
        () =>
          vi
            .mocked(useMe)
            .mockReturnValue(stubQuery<MeData>({ isPending: true })),
      ],
      [
        'the rows',
        () =>
          vi
            .mocked(useMyProgress)
            .mockReturnValue(stubQuery<ListItem[]>({ isPending: true })),
      ],
    ])('is loading while %s is in flight', (_label, setup) => {
      setup()

      expect(render().result.current.isLoading).toBe(true)
    })

    it('is ready once both have resolved', () => {
      expect(render().result.current.isLoading).toBe(false)
    })

    it('reports empty collections before anything loads', () => {
      vi.mocked(useMyProgress).mockReturnValue(
        stubQuery<ListItem[]>({ data: undefined })
      )
      const { result } = render()

      expect(result.current.items).toEqual([])
      expect(result.current.presets).toEqual([])
    })
  })

  describe('the visible rows', () => {
    it('starts sorted by date, newest first', () => {
      expect(render().result.current.sorts).toEqual(DEFAULT_SORTS)
    })

    it('filters and sorts in one pass', () => {
      withItems([
        item({
          level: level({ inGameId: 'a', name: 'Alpha' }),
          status: 'COMPLETED',
        }),
        item({
          level: level({ inGameId: 'b', name: 'Beta' }),
          status: 'DROPPED',
        }),
      ])
      const { result } = render()

      act(() => result.current.setFilters(filters({ statuses: ['COMPLETED'] })))

      expect(result.current.visible.map((i) => i.level.inGameId)).toEqual(['a'])
    })

    it('narrows on the search box', () => {
      withItems([
        item({ level: level({ inGameId: 'a', name: 'Bloodbath' }) }),
        item({ level: level({ inGameId: 'b', name: 'Cataclysm' }) }),
      ])
      const { result } = render()

      act(() => result.current.setSearch('blood'))

      expect(result.current.visible.map((i) => i.level.inGameId)).toEqual(['a'])
    })
  })

  describe('the filter option lists', () => {
    // Only values actually present in the user's own rows are offered, so the
    // chips never advertise a filter that can return nothing.
    it('offers only the lengths the rows use, in game order', () => {
      withItems([
        item({ level: level({ length: 'XL' }) }),
        item({ level: level({ length: 'Tiny' }) }),
        item({ level: level({ length: 'XL' }) }),
        item({ level: level({ length: null }) }),
      ])

      expect(render().result.current.availableLengths).toEqual(['Tiny', 'XL'])
    })

    // Numeric ordering happens to match GD's release order: 2.11 shipped as a
    // patch between 2.1 and 2.2, so it belongs before 2.2 rather than after.
    it('offers game versions in release order', () => {
      withItems([
        item({ level: level({ gameVersion: '2.11' }) }),
        item({ level: level({ gameVersion: '1.9' }) }),
        item({ level: level({ gameVersion: '2.2' }) }),
      ])

      expect(render().result.current.availableGameVersions).toEqual([
        '1.9',
        '2.11',
        '2.2',
      ])
    })

    it('offers difficulties in game order', () => {
      withItems([
        item({ level: level({ inGameDifficulty: 'Extreme Demon' }) }),
        item({ level: level({ inGameDifficulty: 'Easy' }) }),
        item({ level: level({ inGameDifficulty: 'Insane' }) }),
      ])

      expect(render().result.current.availableDifficulties).toEqual([
        'Easy',
        'Insane',
        'Extreme Demon',
      ])
    })

    it('offers nothing for an empty list', () => {
      const { result } = render()

      expect(result.current.availableLengths).toEqual([])
      expect(result.current.availableGameVersions).toEqual([])
      expect(result.current.availableDifficulties).toEqual([])
    })
  })

  // The date and attempts sliders stretch to fit the user's own data rather
  // than clipping their oldest completion or biggest grind out of reach.
  describe('the data-driven slider domains', () => {
    it('starts the date slider at the earliest completion', () => {
      const early = new Date('2019-05-01').getTime()
      withItems([
        item({ status: 'COMPLETED', entry: entry({ date: '2019-05-01' }) }),
        item({ status: 'COMPLETED', entry: entry({ date: '2024-01-01' }) }),
      ])

      expect(render().result.current.earliestDate).toBe(early)
    })

    it('ignores a date on a row that was never completed', () => {
      withItems([
        item({ status: 'IN_PROGRESS', entry: entry({ date: '2019-05-01' }) }),
      ])

      expect(render().result.current.earliestDate).toBe(DATE_MIN_MS)
    })

    it('falls back to the game’s launch with no completions at all', () => {
      expect(render().result.current.earliestDate).toBe(DATE_MIN_MS)
    })

    it('raises the attempts ceiling above the biggest logged run', () => {
      withItems([item({ entry: entry({ attempts: 99999 }) })])

      expect(render().result.current.maxAttempts).toBe(99999)
    })

    it('keeps the default ceiling when no run exceeds it', () => {
      withItems([item({ entry: entry({ attempts: 100 }) })])

      expect(render().result.current.maxAttempts).toBe(ATTEMPTS_DOMAIN[1])
    })
  })

  describe('toggleSort', () => {
    // Clicking a column header replaces the stack rather than appending, so
    // the header click never silently builds a multi-key sort.
    it('replaces the stack with the clicked column', () => {
      const { result } = render()
      act(() => result.current.setSorts([{ key: 'name', dir: 'asc' }]))

      act(() => result.current.toggleSort('attempts'))

      expect(result.current.sorts).toEqual([{ key: 'attempts', dir: 'desc' }])
    })

    it('starts a text column ascending', () => {
      const { result } = render()

      act(() => result.current.toggleSort('name'))

      expect(result.current.sorts).toEqual([{ key: 'name', dir: 'asc' }])
    })

    it('flips the direction when the same column is clicked again', () => {
      const { result } = render()
      act(() => result.current.toggleSort('name'))

      act(() => result.current.toggleSort('name'))

      expect(result.current.sorts).toEqual([{ key: 'name', dir: 'desc' }])
    })

    // Only the PRIMARY sort flips — clicking a column that is merely a
    // tiebreaker promotes it instead.
    it('promotes a secondary sort rather than flipping it', () => {
      const { result } = render()
      act(() =>
        result.current.setSorts([
          { key: 'status', dir: 'asc' },
          { key: 'name', dir: 'desc' },
        ])
      )

      act(() => result.current.toggleSort('name'))

      expect(result.current.sorts).toEqual([{ key: 'name', dir: 'asc' }])
    })
  })

  describe('resetting', () => {
    it('offers a reset once a search or filter is active', () => {
      const { result } = render()
      expect(result.current.canReset).toBe(false)

      act(() => result.current.setSearch('blood'))
      expect(result.current.canReset).toBe(true)
    })

    it('does not count a whitespace-only search', () => {
      const { result } = render()

      act(() => result.current.setSearch('   '))

      expect(result.current.canReset).toBe(false)
    })

    it('clears the search and the filters together', () => {
      const { result } = render()
      act(() => result.current.setSearch('blood'))
      act(() => result.current.setFilters(filters({ statuses: ['COMPLETED'] })))

      act(() => result.current.resetAll())

      expect(result.current.search).toBe('')
      expect(result.current.activeFilterCount).toBe(0)
    })

    // Reset is about the query, not the view — columns and sorts survive it.
    it('leaves the columns and sorts alone', () => {
      const { result } = render()
      act(() => result.current.toggleSort('name'))

      act(() => result.current.resetAll())

      expect(result.current.sorts).toEqual([{ key: 'name', dir: 'asc' }])
    })
  })

  describe('rating categories', () => {
    const weighted = (cats: RatingCategory[]) =>
      vi.mocked(useMe).mockReturnValue(
        stubQuery<MeData>({
          data: meData({ ratingMode: 'WEIGHTED', ratingCategories: cats }),
        })
      )

    it('offers a category column and sort per category', () => {
      weighted([category('gameplay', 0, 'Gameplay')])
      const { result } = render()

      expect(result.current.activeCategories).toHaveLength(1)
      expect(
        result.current.allColumnDefs.some((c) => c.id === 'cat:gameplay')
      ).toBe(true)
      expect(result.current.categorySortOptions).toEqual([
        { key: 'cat:gameplay', label: 'Gameplay' },
      ])
    })

    // Per-category columns only mean anything in weighted mode.
    it('offers none in simple mode, even with categories configured', () => {
      vi.mocked(useMe).mockReturnValue(
        stubQuery<MeData>({
          data: meData({
            ratingMode: 'SIMPLE',
            ratingCategories: [category('gameplay')],
          }),
        })
      )
      const { result } = render()

      expect(result.current.activeCategories).toEqual([])
      expect(result.current.categorySortOptions).toEqual([])
    })

    it('orders the sort options by category priority', () => {
      weighted([category('b', 1, 'B'), category('a', 0, 'A')])
      const { result } = render()

      expect(result.current.categorySortOptions.map((o) => o.key)).toEqual([
        'cat:a',
        'cat:b',
      ])
    })

    it('adds a column slot for each active category', () => {
      weighted([category('gameplay')])
      const { result } = render()

      expect(result.current.columnOrder).toContain('cat:gameplay')
    })

    // A deleted category must not leave a dangling sort, column, or filter
    // behind — those would reference a category that no longer exists.
    it('strips every reference to a deleted category', () => {
      weighted([category('gameplay')])
      const { result, rerender } = render()
      act(() => {
        result.current.setSorts([{ key: 'cat:gameplay', dir: 'desc' }])
        result.current.setColumns({ 'cat:gameplay': true, name: true })
        result.current.setFilters(
          filters({ categoryRatings: { gameplay: [50, 100] } })
        )
      })

      weighted([])
      rerender()

      expect(result.current.sorts).toEqual([])
      expect(result.current.columns).toEqual({ name: true })
      expect(result.current.filters.categoryRatings).toEqual({})
      expect(result.current.columnOrder).not.toContain('cat:gameplay')
    })
  })

  describe('unsaved-change detection', () => {
    it('reports a fresh default view as unmodified', () => {
      expect(render().result.current.isPresetModified).toBe(false)
    })

    it('notices a change away from the default view', () => {
      const { result } = render()

      act(() => result.current.setHideTime(true))

      expect(result.current.isPresetModified).toBe(true)
    })

    // The search box is a transient query, not part of the saved view.
    it('does not count the search box as a change', () => {
      const { result } = render()

      act(() => result.current.setSearch('blood'))

      expect(result.current.isPresetModified).toBe(false)
    })

    it('reports an untouched preset as unmodified', () => {
      withPresets([preset()])
      const { result } = render()

      act(() => result.current.handleSelectPreset('p1'))

      expect(result.current.isPresetModified).toBe(false)
    })

    it('notices a change away from the selected preset', () => {
      withPresets([preset()])
      const { result } = render()
      act(() => result.current.handleSelectPreset('p1'))

      act(() => result.current.setHideTime(true))

      expect(result.current.isPresetModified).toBe(true)
    })

    // A preset deleted in another tab cannot be compared against.
    it('reports nothing modified when the selected preset has vanished', () => {
      withPresets([preset()])
      const { result } = render()
      act(() => result.current.handleSelectPreset('p1'))

      withPresets([])
      act(() => result.current.setHideTime(true))

      expect(result.current.isPresetModified).toBe(false)
    })
  })

  describe('selecting a preset', () => {
    it('applies its whole view', () => {
      withPresets([
        preset({
          hideTime: true,
          sorts: [{ key: 'name', dir: 'asc' }],
          filters: filters({ statuses: ['COMPLETED'] }),
        }),
      ])
      const { result } = render()

      act(() => result.current.handleSelectPreset('p1'))

      expect(result.current.selectedPresetId).toBe('p1')
      expect(result.current.hideTime).toBe(true)
      expect(result.current.sorts).toEqual([{ key: 'name', dir: 'asc' }])
      expect(result.current.filters.statuses).toEqual(['COMPLETED'])
    })

    it('restores the built-in view for the Default option', () => {
      withPresets([preset({ hideTime: true })])
      const { result } = render()
      act(() => result.current.handleSelectPreset('p1'))

      act(() => result.current.handleSelectPreset(null))

      expect(result.current.selectedPresetId).toBeNull()
      expect(result.current.hideTime).toBe(false)
    })

    it('remembers the choice for next time', () => {
      withPresets([preset()])
      const { result } = render()

      act(() => result.current.handleSelectPreset('p1'))

      expect(setPresetCookie).toHaveBeenCalledWith('user-1', 'p1')
    })

    it('ignores an id that matches no preset', () => {
      const { result } = render()

      act(() => result.current.handleSelectPreset('gone'))

      expect(result.current.hideTime).toBe(false)
    })

    // A preset saved before a category existed still needs its column slot,
    // and one saved with a since-deleted category must not carry it back in.
    it('reconciles the preset against the current categories', () => {
      vi.mocked(useMe).mockReturnValue(
        stubQuery<MeData>({
          data: meData({
            ratingMode: 'WEIGHTED',
            ratingCategories: [category('current')],
          }),
        })
      )
      withPresets([
        preset({
          sorts: [{ key: 'cat:deleted', dir: 'desc' }],
          columnOrder: ['tier', 'cat:deleted'],
        }),
      ])
      const { result } = render()

      act(() => result.current.handleSelectPreset('p1'))

      expect(result.current.sorts).toEqual([])
      expect(result.current.columnOrder).not.toContain('cat:deleted')
      expect(result.current.columnOrder).toContain('cat:current')
    })

    it('discards unsaved changes by reselecting the same preset', () => {
      withPresets([preset()])
      const { result } = render()
      act(() => result.current.handleSelectPreset('p1'))
      act(() => result.current.setHideTime(true))

      act(() => result.current.handleDiscardPresetChanges())

      expect(result.current.hideTime).toBe(false)
      expect(result.current.isPresetModified).toBe(false)
    })
  })

  // The last-used preset is restored once, from a cookie, after both the
  // viewer and the preset list have resolved.
  describe('restoring the last-used preset', () => {
    it('applies the remembered preset on first load', () => {
      vi.mocked(getPresetCookie).mockReturnValue('p1')
      withPresets([preset({ hideTime: true })])

      const { result } = render()

      expect(result.current.selectedPresetId).toBe('p1')
      expect(result.current.hideTime).toBe(true)
    })

    it('stays on the default when the cookie says so', () => {
      vi.mocked(getPresetCookie).mockReturnValue('default')
      withPresets([preset()])

      expect(render().result.current.selectedPresetId).toBeNull()
    })

    // The remembered preset may have been deleted since.
    it('stays on the default when the remembered preset is gone', () => {
      vi.mocked(getPresetCookie).mockReturnValue('deleted')
      withPresets([preset()])

      expect(render().result.current.selectedPresetId).toBeNull()
    })

    it('waits for the preset list before deciding', () => {
      vi.mocked(getPresetCookie).mockReturnValue('p1')
      vi.mocked(useListPresets).mockReturnValue(
        stubQuery<ListPreset[]>({ data: undefined })
      )

      expect(render().result.current.selectedPresetId).toBeNull()
    })

    // Restoring more than once would stomp on whatever the user picked after
    // load — a background refetch of either query must not re-trigger it.
    it('restores only once, not on every refetch', () => {
      vi.mocked(getPresetCookie).mockReturnValue('p1')
      withPresets([preset()])
      const { result, rerender } = render()

      act(() => result.current.handleSelectPreset(null))
      withPresets([preset(), preset({ id: 'p2' })])
      rerender()

      expect(result.current.selectedPresetId).toBeNull()
    })
  })

  describe('saving presets', () => {
    it('creates one from the current view', () => {
      const { result } = render()
      act(() => result.current.setHideTime(true))

      act(() =>
        result.current.handleCreatePreset('Extremes', 'my demons', 'blue')
      )

      expect(createMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Extremes',
          description: 'my demons',
          color: 'blue',
          hideTime: true,
        }),
        expect.anything()
      )
    })

    it('sends a null description rather than an empty string', () => {
      const { result } = render()

      act(() => result.current.handleCreatePreset('Extremes', '', 'blue'))

      expect(createMutate.mock.calls[0]![0].description).toBeNull()
    })

    it('selects the new preset and closes the dialog on success', () => {
      const { result } = render()
      act(() => result.current.setCreateDialogOpen(true))
      act(() => result.current.handleCreatePreset('Extremes', '', 'blue'))

      const { onSuccess } = createMutate.mock.calls[0]![1]
      act(() => onSuccess(preset({ id: 'new', name: 'Extremes' })))

      expect(result.current.selectedPresetId).toBe('new')
      expect(result.current.createDialogOpen).toBe(false)
      expect(toast.success).toHaveBeenCalledWith('Preset "Extremes" saved')
    })

    it('reports a failed create and leaves the dialog open', () => {
      const { result } = render()
      act(() => result.current.setCreateDialogOpen(true))
      act(() => result.current.handleCreatePreset('Extremes', '', 'blue'))

      const { onError } = createMutate.mock.calls[0]![1]
      act(() => onError())

      expect(toast.error).toHaveBeenCalledWith('Failed to save preset')
      expect(result.current.createDialogOpen).toBe(true)
    })

    it('overwrites an existing preset with the current view', () => {
      withPresets([preset()])
      const { result } = render()
      act(() => result.current.setHideTime(true))

      act(() => result.current.handleOverwritePreset('p1'))

      expect(updateMutate).toHaveBeenCalledWith(
        { id: 'p1', input: expect.objectContaining({ hideTime: true }) },
        expect.anything()
      )
    })

    it('overwrites nothing for an unknown preset', () => {
      const { result } = render()

      act(() => result.current.handleOverwritePreset('gone'))

      expect(updateMutate).not.toHaveBeenCalled()
    })

    it('renames a preset without touching its view', () => {
      withPresets([preset()])
      const { result } = render()
      act(() => result.current.setEditingPreset(preset()))

      act(() => result.current.handleUpdatePresetMeta('Renamed', '', 'red'))

      expect(updateMutate).toHaveBeenCalledWith(
        {
          id: 'p1',
          input: { name: 'Renamed', description: null, color: 'red' },
        },
        expect.anything()
      )
    })

    it('renames nothing when no preset is being edited', () => {
      const { result } = render()

      act(() => result.current.handleUpdatePresetMeta('Renamed', '', 'red'))

      expect(updateMutate).not.toHaveBeenCalled()
    })

    it('closes the editor on a successful rename', () => {
      withPresets([preset()])
      const { result } = render()
      act(() => result.current.setEditingPreset(preset()))
      act(() => result.current.handleUpdatePresetMeta('Renamed', '', 'red'))

      const { onSuccess } = updateMutate.mock.calls[0]![1]
      act(() => onSuccess())

      expect(result.current.editingPreset).toBeNull()
      expect(toast.success).toHaveBeenCalledWith('Preset "Renamed" updated')
    })
  })

  describe('deleting a preset', () => {
    it('deletes and confirms by name', () => {
      withPresets([preset()])
      const { result } = render()

      act(() => result.current.handleDeletePreset('p1'))
      const { onSuccess } = deletePresetMutate.mock.calls[0]![1]
      act(() => onSuccess())

      expect(deletePresetMutate).toHaveBeenCalledWith('p1', expect.anything())
      expect(toast.success).toHaveBeenCalledWith('Preset "Extremes" deleted')
    })

    // Deleting the preset you are looking at has to leave you somewhere —
    // the built-in default view.
    it('falls back to the default view when the active preset goes', () => {
      withPresets([preset({ hideTime: true })])
      const { result } = render()
      act(() => result.current.handleSelectPreset('p1'))

      act(() => result.current.handleDeletePreset('p1'))
      const { onSuccess } = deletePresetMutate.mock.calls[0]![1]
      act(() => onSuccess())

      expect(result.current.selectedPresetId).toBeNull()
      expect(result.current.hideTime).toBe(false)
    })

    it('leaves the current view alone when another preset goes', () => {
      withPresets([preset({ hideTime: true }), preset({ id: 'p2' })])
      const { result } = render()
      act(() => result.current.handleSelectPreset('p1'))

      act(() => result.current.handleDeletePreset('p2'))
      const { onSuccess } = deletePresetMutate.mock.calls[0]![1]
      act(() => onSuccess())

      expect(result.current.selectedPresetId).toBe('p1')
      expect(result.current.hideTime).toBe(true)
    })

    it('deletes nothing for an unknown preset', () => {
      const { result } = render()

      act(() => result.current.handleDeletePreset('gone'))

      expect(deletePresetMutate).not.toHaveBeenCalled()
    })

    it('reports a failed delete', () => {
      withPresets([preset()])
      const { result } = render()
      act(() => result.current.handleDeletePreset('p1'))

      const { onError } = deletePresetMutate.mock.calls[0]![1]
      act(() => onError())

      expect(toast.error).toHaveBeenCalledWith('Failed to delete preset')
    })

    it('reports which preset is being deleted', () => {
      vi.mocked(useDeletePreset).mockReturnValue(
        stubMutation({
          mutate: deletePresetMutate,
          isPending: true,
          variables: 'p1',
        })
      )

      expect(render().result.current.deletingPresetId).toBe('p1')
    })

    it('reports none while idle', () => {
      expect(render().result.current.deletingPresetId).toBeNull()
    })
  })

  describe('row actions', () => {
    const row = () =>
      item({ level: level({ inGameId: '128', name: 'Bloodbath' }) })

    it.each([
      ['handleEditRun', 'run'],
      ['handleEditLevel', 'level'],
    ] as const)('opens the %s editor on the row’s level', (fn, mode) => {
      const { result } = render()

      act(() => result.current[fn](row()))

      expect(result.current.editingLevelId).toBe('128')
      expect(result.current.editMode).toBe(mode)
    })

    it('closes the editor, forgetting both the level and the mode', () => {
      const { result } = render()
      act(() => result.current.handleEditRun(row()))

      act(() => result.current.closeEditModal())

      expect(result.current.editingLevelId).toBeNull()
      expect(result.current.editMode).toBeNull()
    })

    // The level-page query only runs once a row is being edited, and a
    // failure has to close the modal rather than leave it blank. Sequenced as
    // it really happens: open first, then the fetch fails.
    it('reports and closes when the level data fails to load', () => {
      const { result, rerender } = render()
      act(() => result.current.handleEditRun(row()))

      vi.mocked(useLevelPage).mockReturnValue(
        stubQuery({ isError: true }) as never
      )
      rerender()

      expect(toast.error).toHaveBeenCalledWith('Failed to load level data')
      expect(result.current.editingLevelId).toBeNull()
    })

    it('opens the logging flow on the requested path', () => {
      const { result } = render()

      act(() => result.current.handleLog(row(), 'completion'))

      expect(openForEdit).toHaveBeenCalledWith('128', 'completion')
    })

    // The level page needs to know where "back" goes.
    it('navigates to the level page, remembering where it came from', () => {
      const { result } = render()

      act(() => result.current.handleNavigate(row()))

      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/list/$levelId',
          params: { levelId: '128' },
          state: expect.anything(),
        })
      )
    })
  })

  describe('deleting a level', () => {
    const row = () =>
      item({ level: level({ inGameId: '128', name: 'Bloodbath' }) })

    it('does nothing until a row is armed', () => {
      const { result } = render()

      act(() => result.current.confirmDelete())

      expect(deleteProgressMutate).not.toHaveBeenCalled()
    })

    it('deletes the armed row and confirms by name', () => {
      const { result } = render()
      act(() => result.current.setPendingDelete(row()))

      act(() => result.current.confirmDelete())
      const { onSuccess } = deleteProgressMutate.mock.calls[0]![1]
      act(() => onSuccess())

      expect(deleteProgressMutate).toHaveBeenCalledWith(
        '128',
        expect.anything()
      )
      expect(toast.success).toHaveBeenCalledWith('Deleted Bloodbath')
      expect(result.current.pendingDelete).toBeNull()
    })

    it('names an unnamed level generically', () => {
      const { result } = render()
      act(() =>
        result.current.setPendingDelete(
          item({ level: level({ inGameId: '128', name: null }) })
        )
      )

      act(() => result.current.confirmDelete())
      const { onSuccess } = deleteProgressMutate.mock.calls[0]![1]
      act(() => onSuccess())

      expect(toast.success).toHaveBeenCalledWith('Deleted Level')
    })

    it('reports a failure and keeps the row armed', () => {
      const { result } = render()
      act(() => result.current.setPendingDelete(row()))

      act(() => result.current.confirmDelete())
      const { onError } = deleteProgressMutate.mock.calls[0]![1]
      act(() => onError())

      expect(toast.error).toHaveBeenCalledWith("Couldn't delete Bloodbath")
      expect(result.current.pendingDelete).not.toBeNull()
    })
  })

  describe('the docked filter panel', () => {
    // The panel docks beside the table only when the table's minimum width
    // still fits in what is left; otherwise it opens as an overlay.
    it('cannot dock before the container has been measured', () => {
      expect(render().result.current.canDock).toBe(false)
    })

    it('does not dock on a narrow viewport', () => {
      vi.mocked(useMediaQuery).mockReturnValue(false)

      expect(render().result.current.canDock).toBe(false)
    })

    it('docks once the container is wide enough for both', () => {
      const { result } = render()

      act(() =>
        result.current.containerRef({ clientWidth: 4000 } as HTMLDivElement)
      )

      expect(result.current.canDock).toBe(true)
    })

    // A container that fits the table but not the table PLUS the panel keeps
    // the panel as an overlay rather than squeezing the columns.
    it('stays undocked when the panel would not fit beside the table', () => {
      const { result } = render()

      act(() =>
        result.current.containerRef({ clientWidth: 800 } as HTMLDivElement)
      )

      expect(result.current.canDock).toBe(false)
    })

    it('survives the container being detached', () => {
      const { result } = render()
      act(() =>
        result.current.containerRef({ clientWidth: 4000 } as HTMLDivElement)
      )

      expect(() => act(() => result.current.containerRef(null))).not.toThrow()
    })
  })

  it('starts with every sheet and dialog closed', () => {
    const { result } = render()

    expect(result.current.filterOpen).toBe(false)
    expect(result.current.controlsOpen).toBe(false)
    expect(result.current.presetSheetOpen).toBe(false)
    expect(result.current.createDialogOpen).toBe(false)
    expect(result.current.editingPreset).toBeNull()
    expect(result.current.pendingDelete).toBeNull()
    expect(result.current.addToCollectionItem).toBeNull()
  })
})
