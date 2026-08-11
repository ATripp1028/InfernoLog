import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { FabAction } from '@/context/FabActionsContext'
import type { CollectionDetail } from '@/lib/api/collections'
import { CollectionType } from '@infernolog/core'
import {
  apiError,
  makeCollectionDetail,
  makeEntry,
  queryWrapper,
  stubMutation,
  stubQuery,
} from '@/utils/testUtils'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/context/FabActionsContext', () => ({ useFabActions: vi.fn() }))
vi.mock('@/lib/api/collections', () => ({
  useCollection: vi.fn(),
  useUpdateCollection: vi.fn(),
  useDeleteCollection: vi.fn(),
  useRemoveCollectionEntry: vi.fn(),
  useReorderCollectionEntry: vi.fn(),
}))

const { toast } = await import('@/components/generic/sonner')
const { useFabActions } = await import('@/context/FabActionsContext')
const {
  useCollection,
  useDeleteCollection,
  useRemoveCollectionEntry,
  useReorderCollectionEntry,
  useUpdateCollection,
} = await import('@/lib/api/collections')
const { useCollectionDetailPage, useLoadedCollection } =
  await import('../useCollectionDetailPage')

// Spies the mutation hooks hand back, re-created per test.
let updateAsync: ReturnType<typeof vi.fn>
let deleteAsync: ReturnType<typeof vi.fn>
let removeMutate: ReturnType<typeof vi.fn>
let reorderMutate: ReturnType<typeof vi.fn>

beforeEach(() => {
  updateAsync = vi.fn().mockResolvedValue(undefined)
  deleteAsync = vi.fn().mockResolvedValue(undefined)
  removeMutate = vi.fn()
  reorderMutate = vi.fn()
  vi.mocked(useUpdateCollection).mockReturnValue(
    stubMutation({ mutateAsync: updateAsync })
  )
  vi.mocked(useDeleteCollection).mockReturnValue(
    stubMutation({ mutateAsync: deleteAsync })
  )
  vi.mocked(useRemoveCollectionEntry).mockReturnValue(
    stubMutation({ mutate: removeMutate })
  )
  vi.mocked(useReorderCollectionEntry).mockReturnValue(
    stubMutation({ mutate: reorderMutate })
  )
  vi.mocked(useCollection).mockReturnValue(stubQuery<CollectionDetail>())
})

/** The action set the page last registered with the FAB (null while loading). */
function registeredFabActions(): FabAction[] | null {
  const calls = vi.mocked(useFabActions).mock.calls
  return calls[calls.length - 1]?.[0] ?? null
}

describe('useCollectionDetailPage', () => {
  const render = () => {
    const { wrapper } = queryWrapper()
    return renderHook(() => useCollectionDetailPage('collection-1'), {
      wrapper,
    })
  }

  it('reports the loading state while the collection query is pending', () => {
    vi.mocked(useCollection).mockReturnValue(
      stubQuery<CollectionDetail>({ isPending: true })
    )

    const { result } = render()

    expect(result.current.isLoading).toBe(true)
    expect(result.current.failed).toBe(true)
  })

  it('exposes the collection once it lands', () => {
    const collection = makeCollectionDetail()
    vi.mocked(useCollection).mockReturnValue(stubQuery({ data: collection }))

    const { result } = render()

    expect(result.current.data).toBe(collection)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.failed).toBe(false)
  })

  // "Missing" and "failed" get different copy on the page, so a 404 must be
  // distinguishable from every other failure — including other ApiErrors.
  it('flags a 404 as missing rather than failed-for-another-reason', () => {
    vi.mocked(useCollection).mockReturnValue(
      stubQuery<CollectionDetail>({ error: apiError(404, 'Not found') })
    )

    const { result } = render()

    expect(result.current.isMissing).toBe(true)
    expect(result.current.failed).toBe(true)
  })

  it.each([
    ['a 500', apiError(500, 'Server error')],
    ['a network error', new Error('offline')],
  ])('does not flag %s as missing', (_label, error) => {
    vi.mocked(useCollection).mockReturnValue(
      stubQuery<CollectionDetail>({ error })
    )

    const { result } = render()

    expect(result.current.isMissing).toBe(false)
    expect(result.current.failed).toBe(true)
  })

  it('starts with every dialog closed', () => {
    vi.mocked(useCollection).mockReturnValue(
      stubQuery({ data: makeCollectionDetail() })
    )

    const { result } = render()

    expect(result.current.addOpen).toBe(false)
    expect(result.current.editOpen).toBe(false)
    expect(result.current.confirmDelete).toBe(false)
  })

  // Registering `null` (rather than skipping the call) is what lets the FAB
  // swap to this collection's actions in the same commit the data arrives,
  // instead of showing the global logging actions for the whole load.
  it('registers no FAB override while the collection is loading', () => {
    vi.mocked(useCollection).mockReturnValue(
      stubQuery<CollectionDetail>({ isPending: true })
    )

    render()

    expect(useFabActions).toHaveBeenCalled()
    expect(registeredFabActions()).toBeNull()
  })

  it('registers the full action set for a custom collection', () => {
    vi.mocked(useCollection).mockReturnValue(
      stubQuery({ data: makeCollectionDetail({ type: CollectionType.CUSTOM }) })
    )

    render()

    expect(registeredFabActions()?.map((a) => a.key)).toEqual([
      'add',
      'edit',
      'delete',
    ])
  })

  it('drops edit and delete for a built-in collection', () => {
    vi.mocked(useCollection).mockReturnValue(
      stubQuery({
        data: makeCollectionDetail({ type: CollectionType.WANT_TO_BEAT }),
      })
    )

    render()

    expect(registeredFabActions()?.map((a) => a.key)).toEqual(['add'])
  })

  it.each([
    ['add', 'addOpen'],
    ['edit', 'editOpen'],
    ['delete', 'confirmDelete'],
  ] as const)('opens the %s dialog from its FAB action', (key, flag) => {
    vi.mocked(useCollection).mockReturnValue(
      stubQuery({ data: makeCollectionDetail() })
    )

    const { result } = render()
    act(() =>
      registeredFabActions()!
        .find((a) => a.key === key)!
        .onClick()
    )

    expect(result.current[flag]).toBe(true)
  })
})

describe('useLoadedCollection', () => {
  const entries = [
    makeEntry({ id: 'e1' }),
    makeEntry({ id: 'e2' }),
    makeEntry({ id: 'e3' }),
    makeEntry({ id: 'e4' }),
  ]
  const collection = makeCollectionDetail({ id: 'collection-1', entries })

  const render = (
    initial: CollectionDetail = collection,
    onEditSaved = vi.fn()
  ) => {
    const { queryClient, wrapper } = queryWrapper()
    const view = renderHook(
      ({ data }: { data: CollectionDetail }) =>
        useLoadedCollection(data, onEditSaved),
      { wrapper, initialProps: { data: initial } }
    )
    return { ...view, queryClient, onEditSaved }
  }

  const dragEnd = (activeId: string, overId: string) =>
    ({ active: { id: activeId }, over: { id: overId } }) as DragEndEvent

  it('mirrors the collection entries for display', () => {
    const { result } = render()

    expect(result.current.displayEntries.map((e) => e.id)).toEqual([
      'e1',
      'e2',
      'e3',
      'e4',
    ])
  })

  it('resyncs when the collection entries change', () => {
    const { result, rerender } = render()

    rerender({ data: { ...collection, entries: [entries[0]!, entries[1]!] } })

    expect(result.current.displayEntries.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  describe('drag to reorder', () => {
    it('tracks the dragged row', () => {
      const { result } = render()

      act(() =>
        result.current.handleDragStart({
          active: { id: 'e3' },
        } as DragStartEvent)
      )

      expect(result.current.activeId).toBe('e3')
      expect(result.current.activeIndex).toBe(2)
      expect(result.current.activeEntry?.id).toBe('e3')
    })

    it('clears the dragged row on cancel', () => {
      const { result } = render()
      act(() =>
        result.current.handleDragStart({
          active: { id: 'e3' },
        } as DragStartEvent)
      )

      act(() => result.current.handleDragCancel())

      expect(result.current.activeId).toBeNull()
      expect(result.current.activeIndex).toBe(-1)
      expect(result.current.activeEntry).toBeNull()
    })

    it('applies the move locally, without waiting for the write', () => {
      const { result } = render()

      act(() => result.current.handleDragEnd(dragEnd('e1', 'e3')))

      expect(result.current.displayEntries.map((e) => e.id)).toEqual([
        'e2',
        'e3',
        'e1',
        'e4',
      ])
    })

    // The neighbours are computed against the list with the dragged row
    // already removed — get this wrong and a downward drag lands one slot off.
    it.each([
      ['down past two rows', 'e1', 'e3', 'e3', 'e4'],
      ['up past two rows', 'e4', 'e2', 'e1', 'e2'],
      ['to the very top', 'e2', 'e1', undefined, 'e1'],
      ['to the very bottom', 'e1', 'e4', 'e4', undefined],
    ] as const)(
      'sends the neighbours around the drop slot when moving %s',
      (_label, activeId, overId, prevId, nextId) => {
        const { result } = render()

        act(() => result.current.handleDragEnd(dragEnd(activeId, overId)))

        expect(reorderMutate).toHaveBeenCalledWith(
          { collectionId: 'collection-1', entryId: activeId, prevId, nextId },
          expect.anything()
        )
      }
    )

    it('does nothing when a row is dropped on itself', () => {
      const { result } = render()

      act(() => result.current.handleDragEnd(dragEnd('e2', 'e2')))

      expect(reorderMutate).not.toHaveBeenCalled()
    })

    it('does nothing when a row is dropped outside the list', () => {
      const { result } = render()

      act(() =>
        result.current.handleDragEnd({
          active: { id: 'e2' },
          over: null,
        } as DragEndEvent)
      )

      expect(reorderMutate).not.toHaveBeenCalled()
    })

    it('toasts when the reorder write fails', () => {
      const { result } = render()
      act(() => result.current.handleDragEnd(dragEnd('e1', 'e3')))

      const onError = reorderMutate.mock.calls[0]![1].onError as (
        e: unknown
      ) => void
      act(() => onError(apiError(409, 'Stale ordering')))

      expect(toast.error).toHaveBeenCalledWith('Stale ordering')
    })

    it('falls back to generic copy for a non-API reorder failure', () => {
      const { result } = render()
      act(() => result.current.handleDragEnd(dragEnd('e1', 'e3')))

      const onError = reorderMutate.mock.calls[0]![1].onError as (
        e: unknown
      ) => void
      act(() => onError(new Error('offline')))

      expect(toast.error).toHaveBeenCalledWith('Could not reorder')
    })

    // Resyncing mid-drag would yank the row out from under the cursor.
    it('holds the local order while a drag is in flight', () => {
      const { result, rerender } = render()
      act(() =>
        result.current.handleDragStart({
          active: { id: 'e1' },
        } as DragStartEvent)
      )

      rerender({ data: { ...collection, entries: [entries[3]!] } })

      expect(result.current.displayEntries).toHaveLength(4)
    })

    // The optimistic cache update lands asynchronously; resyncing before the
    // reorder queue drains would briefly snap rows back to their old slots.
    it('holds the local order while a reorder write is pending', async () => {
      const { result, rerender, queryClient } = render()
      act(() => {
        void queryClient
          .getMutationCache()
          .build(queryClient, {
            mutationKey: ['collectionReorder'],
            mutationFn: () => new Promise(() => {}),
          })
          .execute(undefined)
      })
      act(() => result.current.handleDragEnd(dragEnd('e1', 'e3')))

      rerender({ data: { ...collection, entries: [entries[0]!] } })

      expect(result.current.displayEntries.map((e) => e.id)).toEqual([
        'e2',
        'e3',
        'e1',
        'e4',
      ])
    })
  })

  describe('removing an entry', () => {
    it('removes by collection and entry id', () => {
      const { result } = render()

      act(() => result.current.handleRemoveEntry('e2'))

      expect(removeMutate).toHaveBeenCalledWith(
        { collectionId: 'collection-1', entryId: 'e2' },
        expect.anything()
      )
    })

    it.each([
      [apiError(403, 'Not yours'), 'Not yours'],
      [new Error('offline'), 'Could not remove that level'],
    ])('toasts when the removal fails', (error, expected) => {
      const { result } = render()
      act(() => result.current.handleRemoveEntry('e2'))

      const onError = removeMutate.mock.calls[0]![1].onError as (
        e: unknown
      ) => void
      act(() => onError(error))

      expect(toast.error).toHaveBeenCalledWith(expected)
    })

    // Guards the mutationKey agreement between useRemoveCollectionEntry and
    // this hook — a mismatch silently stops rows from showing as removing.
    it('reports which entries have a removal in flight', async () => {
      const { result, queryClient } = render()

      act(() => {
        void queryClient
          .getMutationCache()
          .build(queryClient, {
            mutationKey: ['removeCollectionEntry'],
            mutationFn: () => new Promise(() => {}),
          })
          .execute({ entryId: 'e2' })
      })

      await waitFor(() =>
        expect(result.current.removingEntryIds).toEqual(['e2'])
      )
    })
  })

  describe('renaming', () => {
    it('saves, confirms, and lets the page close its dialog', async () => {
      const { result, onEditSaved } = render()

      await act(() =>
        result.current.handleSaveEdit({ name: 'Renamed', description: null })
      )

      expect(updateAsync).toHaveBeenCalledWith({
        collectionId: 'collection-1',
        input: { name: 'Renamed', description: null },
      })
      expect(toast.success).toHaveBeenCalledWith('Collection updated')
      expect(onEditSaved).toHaveBeenCalledOnce()
    })

    // The dialog surfaces the failure through its own form state, so a
    // rejected save must reject here rather than reporting success.
    it('rejects without confirming when the save fails', async () => {
      updateAsync.mockRejectedValue(apiError(409, 'DUPLICATE_NAME'))
      const { result, onEditSaved } = render()

      await expect(
        result.current.handleSaveEdit({ name: 'Taken', description: null })
      ).rejects.toThrow()
      expect(toast.success).not.toHaveBeenCalled()
      expect(onEditSaved).not.toHaveBeenCalled()
    })
  })

  describe('deleting', () => {
    it('deletes, confirms by name, and returns to the index', async () => {
      const { result } = render()

      await act(async () => result.current.handleDelete())

      expect(deleteAsync).toHaveBeenCalledWith('collection-1')
      expect(toast.success).toHaveBeenCalledWith('Deleted My Collection')
      expect(navigate).toHaveBeenCalledWith({ to: '/collections' })
    })

    it('stays on the page when the delete fails', async () => {
      deleteAsync.mockRejectedValue(apiError(400, 'BUILT_IN_COLLECTION'))
      const { result } = render()

      await act(async () => result.current.handleDelete())

      expect(toast.error).toHaveBeenCalledWith('BUILT_IN_COLLECTION')
      expect(navigate).not.toHaveBeenCalled()
    })

    it('falls back to generic copy for a non-API delete failure', async () => {
      deleteAsync.mockRejectedValue(new Error('offline'))
      const { result } = render()

      await act(async () => result.current.handleDelete())

      expect(toast.error).toHaveBeenCalledWith('Could not delete collection')
      expect(navigate).not.toHaveBeenCalled()
    })
  })
})
