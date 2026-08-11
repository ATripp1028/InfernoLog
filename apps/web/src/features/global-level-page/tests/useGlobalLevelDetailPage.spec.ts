import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CollectionType } from '@infernolog/core'
import type { FabAction } from '@/context/FabActionsContext'
import type { CollectionSummary } from '@/lib/api/collections'
import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'
import {
  apiError,
  makeCollectionSummary,
  makeGlobalLevel,
  queryWrapper,
  stubMutation,
  stubQuery,
} from '@/utils/testUtils'

const LEVEL_ID = '12345'

const { navigate, back, openForEdit } = vi.hoisted(() => ({
  navigate: vi.fn(),
  back: { href: '/list', replace: false, isOrigin: false, onClick: vi.fn() },
  openForEdit: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ levelId: LEVEL_ID }),
}))
vi.mock('@/lib/useGoBack', () => ({ useGoBack: vi.fn(() => back) }))
vi.mock('@/context/FabActionsContext', () => ({ useFabActions: vi.fn() }))
vi.mock('@/features/logging/LoggingFlowProvider', () => ({
  useLoggingFlow: () => ({ openForEdit }),
}))
vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
// levelPageErrorKind and collectionErrorCode stay real: the error states and
// the Want to Beat copy below are only trustworthy if the status and the
// machine-readable code are actually read off an ApiError the way the API
// sends them.
vi.mock('@/lib/api/globalLevelPage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/globalLevelPage')>()),
  useGlobalLevelPage: vi.fn(),
}))
vi.mock('@/lib/api/collections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/collections')>()),
  useCollections: vi.fn(),
  useAddCollectionEntry: vi.fn(),
}))

const { toast } = await import('@/components/generic/sonner')
const { useGoBack } = await import('@/lib/useGoBack')
const { useFabActions } = await import('@/context/FabActionsContext')
const { useGlobalLevelPage } = await import('@/lib/api/globalLevelPage')
const { useCollections, useAddCollectionEntry } =
  await import('@/lib/api/collections')
const { useGlobalLevelDetailPage } = await import('../useGlobalLevelDetailPage')

const wantToBeat = makeCollectionSummary({
  id: 'wtb',
  name: 'Want to Beat',
  type: CollectionType.WANT_TO_BEAT,
})

let refetch: ReturnType<typeof vi.fn>
let addMutate: ReturnType<typeof vi.fn>

beforeEach(() => {
  refetch = vi.fn()
  addMutate = vi.fn()
  vi.mocked(useAddCollectionEntry).mockReturnValue(
    stubMutation({ mutate: addMutate })
  )
  vi.mocked(useCollections).mockReturnValue(
    stubQuery<CollectionSummary[]>({ data: [wantToBeat] })
  )
  vi.mocked(useGlobalLevelPage).mockReturnValue(
    stubQuery<GlobalLevelPageData>({ data: makeGlobalLevel(), refetch })
  )
})

function render() {
  const { wrapper } = queryWrapper()
  return renderHook(() => useGlobalLevelDetailPage(), { wrapper })
}

/** What the query hook is made to return for this test. */
function resolvesTo(overrides: Partial<GlobalLevelPageData>) {
  vi.mocked(useGlobalLevelPage).mockReturnValue(
    stubQuery<GlobalLevelPageData>({
      data: makeGlobalLevel({ inGameId: LEVEL_ID, ...overrides }),
      refetch,
    })
  )
}

function failsWith(error: unknown) {
  vi.mocked(useGlobalLevelPage).mockReturnValue(
    stubQuery<GlobalLevelPageData>({ error, refetch })
  )
}

function isPending() {
  vi.mocked(useGlobalLevelPage).mockReturnValue(
    stubQuery<GlobalLevelPageData>({ isPending: true, refetch })
  )
}

/** The action set the page last registered with the FAB. */
function registeredFab(): {
  actions: FabAction[] | null
  sheetHeader: string | null | undefined
} {
  const calls = vi.mocked(useFabActions).mock.calls
  const last = calls[calls.length - 1]
  return { actions: last?.[0] ?? null, sheetHeader: last?.[1] }
}

const fabAction = (key: string) =>
  registeredFab().actions?.find((a) => a.key === key)

describe('useGlobalLevelDetailPage', () => {
  describe('the resolve query', () => {
    it('resolves the level named in the route', () => {
      render()

      expect(useGlobalLevelPage).toHaveBeenCalledWith(LEVEL_ID)
    })

    it('reports the loading state while the resolve is in flight', () => {
      isPending()

      const { result } = render()

      expect(result.current.isLoading).toBe(true)
      expect(result.current.level).toBeUndefined()
    })

    it('retries on demand', () => {
      failsWith(apiError(503, 'Unreachable'))

      const { result } = render()
      act(() => result.current.retry())

      expect(refetch).toHaveBeenCalledOnce()
    })

    it('sends the user to their list on demand', () => {
      const { result } = render()

      act(() => result.current.goToList())

      expect(navigate).toHaveBeenCalledWith({ to: '/list' })
    })

    it('falls back to the list for the back affordance', () => {
      const { result } = render()

      expect(useGoBack).toHaveBeenCalledWith('/list')
      expect(result.current.back).toBe(back)
    })
  })

  // Each kind gets its own terminal copy; 404 and 503 are meaningful states
  // rather than failures, so they must stay distinguishable from a 500.
  describe('error classification', () => {
    it.each([
      ['a 404', apiError(404, 'Not found'), 'not_found'],
      ['a 503', apiError(503, 'Unreachable'), 'unreachable'],
      ['a 500', apiError(500, 'Server error'), 'unknown'],
      ['a network failure', new Error('offline'), 'unknown'],
    ])('classifies %s as %s', (_label, error, kind) => {
      failsWith(error)

      const { result } = render()

      expect(result.current.errorKind).toBe(kind)
    })

    it('reports no error kind for a successful resolve', () => {
      const { result } = render()

      expect(result.current.errorKind).toBeNull()
    })
  })

  describe('level presentation', () => {
    it('uses the level name once resolved', () => {
      resolvesTo({ name: 'Tidal Wave' })

      const { result } = render()

      expect(result.current.levelName).toBe('Tidal Wave')
    })

    it.each([
      ['the level is unnamed', () => resolvesTo({ name: null })],
      ['the resolve is still pending', () => isPending()],
    ])('falls back to the id when %s', (_label, setup) => {
      setup()

      const { result } = render()

      expect(result.current.levelName).toBe(`Level #${LEVEL_ID}`)
    })

    it('flags a delisted level', () => {
      resolvesTo({ delistedAt: '2026-01-01T00:00:00.000Z' })

      const { result } = render()

      expect(result.current.delisted).toBe(true)
    })

    it.each([
      ['a listed level', () => resolvesTo({ delistedAt: null })],
      ['an unresolved level', () => isPending()],
    ])('does not flag %s as delisted', (_label, setup) => {
      setup()

      const { result } = render()

      expect(result.current.delisted).toBe(false)
    })
  })

  describe('the preselected level for Add to Collection', () => {
    it('is absent until the level resolves', () => {
      isPending()

      const { result } = render()

      expect(result.current.preselectedLevel).toBeUndefined()
    })

    it('carries exactly the fields the dialog renders and writes', () => {
      resolvesTo({
        name: 'Tidal Wave',
        creator: 'OniLink',
        inGameDifficulty: 'EXTREME_DEMON',
        featured: true,
        epicValue: 2,
        isRated: true,
      })

      const { result } = render()

      expect(result.current.preselectedLevel).toEqual({
        inGameId: LEVEL_ID,
        name: 'Tidal Wave',
        creator: 'OniLink',
        inGameDifficulty: 'EXTREME_DEMON',
        featured: true,
        epicValue: 2,
        isRated: true,
      })
    })

    // The dialog's reset effect is keyed on this object, so a fresh identity
    // every render would wipe in-progress selections while it is open.
    it('keeps a stable identity across unrelated re-renders', () => {
      const { result, rerender } = render()
      const first = result.current.preselectedLevel

      rerender()

      expect(result.current.preselectedLevel).toBe(first)
    })
  })

  describe('the level-scoped FAB', () => {
    it('offers the logging actions plus both collection paths', () => {
      render()

      expect(registeredFab().actions?.map((a) => a.key)).toEqual([
        'log-completion',
        'log-progress',
        'log-drop',
        'want-to-beat',
        'add-collection',
      ])
    })

    // Nothing on the page is actionable once the resolve has terminally
    // failed, so the FAB steps aside rather than showing disabled actions.
    it.each([
      ['not found', apiError(404, 'Not found')],
      ['unreachable', apiError(503, 'Unreachable')],
      ['an unknown failure', new Error('offline')],
    ])('is suppressed entirely when the level is %s', (_label, error) => {
      failsWith(error)

      render()

      expect(registeredFab().actions).toBeNull()
    })

    it('disables every action while the resolve is in flight', () => {
      isPending()

      render()

      expect(registeredFab().actions?.every((a) => a.disabled)).toBe(true)
    })

    // Delisting is a fact about GD's servers, not about the user's history —
    // they can still log a level they already played.
    it('keeps logging enabled for a delisted level', () => {
      resolvesTo({ delistedAt: '2026-01-01T00:00:00.000Z' })

      render()

      expect(fabAction('log-completion')?.disabled).toBe(false)
    })

    it.each([
      ['log-completion', 'completion'],
      ['log-progress', 'progress'],
      ['log-drop', 'drop'],
    ])('opens the logging flow from %s', (key, kind) => {
      render()

      act(() => fabAction(key)!.onClick())

      expect(openForEdit).toHaveBeenCalledWith(LEVEL_ID, kind)
    })

    it('opens the Add to Collection dialog', () => {
      const { result } = render()
      expect(result.current.addToCollectionOpen).toBe(false)

      act(() => fabAction('add-collection')!.onClick())

      expect(result.current.addToCollectionOpen).toBe(true)
    })

    describe('the Want to Beat action', () => {
      it('is enabled once the collection id resolves', () => {
        render()

        expect(fabAction('want-to-beat')?.disabled).toBe(false)
      })

      it('waits for the collections index before offering itself', () => {
        vi.mocked(useCollections).mockReturnValue(
          stubQuery<CollectionSummary[]>({ data: undefined })
        )

        render()

        expect(fabAction('want-to-beat')?.disabled).toBe(true)
      })

      // A double-tap would otherwise fire two adds for the same level.
      it('is disabled while an add is already in flight', () => {
        vi.mocked(useAddCollectionEntry).mockReturnValue(
          stubMutation({ mutate: addMutate, isPending: true })
        )

        render()

        expect(fabAction('want-to-beat')?.disabled).toBe(true)
      })
    })

    describe('the mobile sheet header', () => {
      it('names the resolved level', () => {
        resolvesTo({ name: 'Tidal Wave' })

        render()

        expect(registeredFab().sheetHeader).toBe('Tidal Wave')
      })

      it('falls back to the id for an unnamed level', () => {
        resolvesTo({ name: null })

        render()

        expect(registeredFab().sheetHeader).toBe(`Level #${LEVEL_ID}`)
      })

      it('is omitted until the level resolves', () => {
        isPending()

        render()

        expect(registeredFab().sheetHeader).toBeUndefined()
      })
    })
  })

  describe('one-tap Add to Want to Beat', () => {
    const tap = () => {
      const view = render()
      act(() => fabAction('want-to-beat')!.onClick())
      return view
    }

    it('adds this level to the Want to Beat collection', () => {
      tap()

      expect(addMutate).toHaveBeenCalledWith(
        { collectionId: 'wtb', levelId: LEVEL_ID },
        expect.anything()
      )
    })

    it('does nothing until the Want to Beat id is known', () => {
      vi.mocked(useCollections).mockReturnValue(
        stubQuery<CollectionSummary[]>({ data: [] })
      )

      tap()

      expect(addMutate).not.toHaveBeenCalled()
    })

    it('confirms a successful add', () => {
      tap()

      const { onSuccess } = addMutate.mock.calls[0]![1]
      act(() => onSuccess())

      expect(toast.success).toHaveBeenCalledWith('Added to Want to Beat')
    })

    it.each([
      [
        'the level is already beaten',
        apiError(400, 'LEVEL_ALREADY_COMPLETED', {
          error: 'LEVEL_ALREADY_COMPLETED',
        }),
        'Already completed — Want to Beat only holds unbeaten levels',
      ],
      [
        'the API rejects it for another reason',
        apiError(409, 'Already in collection'),
        'Already in collection',
      ],
      [
        'the request never lands',
        new Error('offline'),
        'Could not add to Want to Beat',
      ],
    ])('reports the failure when %s', (_label, error, expected) => {
      tap()

      const { onError } = addMutate.mock.calls[0]![1]
      act(() => onError(error))

      expect(toast.error).toHaveBeenCalledWith(expected)
    })
  })
})
