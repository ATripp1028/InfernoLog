import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FindLevelStep } from '../FindLevelStep'
import { useLoggingFlow } from '../../LoggingFlowProvider'
import {
  useLevelById,
  useLevelSearch,
  useResolveLevel,
} from '@/lib/api/logging'
import { useMyProgress } from '@/lib/api/list'
import { useEscalation } from '@/features/search/useEscalation'
import { toast } from '@/components/generic/sonner'
import { ApiError } from '@/lib/api/client'
import type { ResolveLevelResponse } from '@/lib/api/logging'
import {
  LevelProgressStatus,
  makeCachedLevel,
  makeListItem,
  makeResolveResponse,
  makeSearchResult,
  renderWithProviders,
  stubEscalation,
  stubLoggingFlow,
  stubMutation,
  stubQuery,
} from '@/utils/testUtils'

// This step keeps its state inline rather than in a use<Component> sibling, so
// there is no logic hook to stub — the boundaries are the lib/api hooks it
// calls, the flow context, and the escalation hook. `sortAndCapSearchResults`
// stays real; the ordering it produces is part of what these tests claim.
vi.mock('../../LoggingFlowProvider')
vi.mock('@/lib/api/logging', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/logging')>()),
  useLevelById: vi.fn(),
  useLevelSearch: vi.fn(),
  useResolveLevel: vi.fn(),
}))
vi.mock('@/lib/api/list', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/list')>()),
  useMyProgress: vi.fn(),
}))
vi.mock('@/features/search/useEscalation')
vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

/** `useResolveLevel`'s result shape, so the mock matches the hook's types. */
const resolveMutation = (overrides: Parameters<typeof stubMutation>[0] = {}) =>
  stubMutation<ResolveLevelResponse, string>(overrides)

interface Options {
  cached?: ReturnType<typeof makeCachedLevel> | undefined
  cachedFetching?: boolean
  results?: ReturnType<typeof makeSearchResult>[]
  searchPending?: boolean
  completedIds?: string[]
  resolve?: ReturnType<typeof resolveMutation>
}

function render({
  cached = undefined,
  cachedFetching = false,
  results = [],
  searchPending = false,
  completedIds = [],
  resolve = resolveMutation(),
}: Options = {}) {
  const flow = stubLoggingFlow({ step: 'find' })
  vi.mocked(useLoggingFlow).mockReturnValue(flow)
  vi.mocked(useLevelById).mockReturnValue(
    stubQuery({ data: cached, isFetching: cachedFetching })
  )
  vi.mocked(useLevelSearch).mockReturnValue(
    stubQuery({ data: results, isPending: searchPending })
  )
  vi.mocked(useResolveLevel).mockReturnValue(resolve)
  vi.mocked(useMyProgress).mockReturnValue(
    stubQuery({
      data: completedIds.map((id) =>
        makeListItem({
          status: LevelProgressStatus.COMPLETED,
          level: { ...makeListItem().level, inGameId: id },
        })
      ),
    })
  )
  vi.mocked(useEscalation).mockReturnValue(stubEscalation())
  return { ...renderWithProviders(<FindLevelStep />), flow }
}

const queryBox = () => screen.getByLabelText('Level ID or name')
const type = (text: string) => userEvent.type(queryBox(), text)

describe('FindLevelStep', () => {
  it('explains the id-vs-name split before anything is typed', () => {
    render()

    expect(
      screen.getByText(/Numbers only → looked up as an ID/)
    ).toBeInTheDocument()
  })

  it('previews a numeric id already in the cache', async () => {
    render({
      cached: makeCachedLevel({ inGameId: '4284013', name: 'Bloodbath' }),
    })

    await type('4284013')

    expect(screen.getByText('Bloodbath')).toBeInTheDocument()
  })

  it('waits for a plausible id before offering anything', async () => {
    render({ cached: makeCachedLevel({ name: 'Bloodbath' }) })

    await type('428')

    // Three digits is not yet a level id; no preview and no fetch offer.
    expect(screen.queryByText('Bloodbath')).not.toBeInTheDocument()
    expect(screen.queryByText(/Fetch level/)).not.toBeInTheDocument()
  })

  it('offers a GD-server fetch for a numeric id the cache does not know', async () => {
    render({ cached: undefined })

    await type('4284013')

    expect(
      screen.getByRole('button', { name: /Fetch level 4284013/ })
    ).toBeInTheDocument()
  })

  it('does not offer the fetch while the cache lookup is still in flight', async () => {
    render({ cached: undefined, cachedFetching: true })

    await type('4284013')

    expect(screen.queryByText(/Fetch level/)).not.toBeInTheDocument()
  })

  it('searches by name once the query is long enough', async () => {
    render({ results: [makeSearchResult({ name: 'Bloodbath' })] })

    await type('bl')

    expect(screen.getByText('Bloodbath')).toBeInTheDocument()
  })

  it('reports searching rather than no-matches while the query is in flight', async () => {
    render({ results: [], searchPending: true })

    await type('bl')

    expect(screen.getByText('Searching…')).toBeInTheDocument()
    expect(screen.queryByText(/No matches yet/)).not.toBeInTheDocument()
  })

  it('tells the user to paste an id when the cache has no match', async () => {
    render({ results: [] })

    await type('zzzz')

    expect(screen.getByText(/No matches yet/)).toBeInTheDocument()
  })

  it('greys out a level whose completion is already logged', async () => {
    render({
      results: [makeSearchResult({ inGameId: '111', name: 'Done' })],
      completedIds: ['111'],
    })

    await type('do')

    expect(screen.getByText('Already logged')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Done/ })).toBeDisabled()
  })

  // Resolving is a round-trip to the API, and the row the user clicked is the
  // only place that wait means anything — the rest just stop taking clicks.
  it('spins the row being resolved, and only that one', async () => {
    render({
      results: [
        makeSearchResult({ inGameId: '111', name: 'Bloodbath' }),
        makeSearchResult({ inGameId: '222', name: 'Bloodlust' }),
      ],
      resolve: resolveMutation({ isPending: true, variables: '111' }),
    })

    await type('blood')

    const clicked = screen.getByRole('button', { name: /Bloodbath/ })
    expect(clicked.querySelector('.animate-spin')).toBeInTheDocument()

    const other = screen.getByRole('button', { name: /Bloodlust/ })
    expect(other.querySelector('.animate-spin')).toBeNull()
    expect(other).toBeDisabled()
  })

  it('applies a resolved level to the flow', async () => {
    const level = makeCachedLevel({ inGameId: '4284013', name: 'Bloodbath' })
    const mutateAsync = vi
      .fn()
      .mockResolvedValue(makeResolveResponse({ level, suggestedGddlTier: 21 }))
    const { flow } = render({
      cached: level,
      resolve: resolveMutation({ mutateAsync }),
    })

    await type('4284013')
    await userEvent.click(screen.getByText('Bloodbath'))

    await waitFor(() =>
      expect(flow.applyResolved).toHaveBeenCalledWith({
        level,
        existingCompletion: null,
        suggestedGddlTier: 21,
      })
    )
  })

  it('diverts to manual entry when the level cannot be resolved', async () => {
    const level = makeCachedLevel({ inGameId: '4284013', name: 'Bloodbath' })
    const mutateAsync = vi
      .fn()
      .mockResolvedValue(makeResolveResponse({ fallbackToManual: true }))
    const { flow } = render({
      cached: level,
      resolve: resolveMutation({ mutateAsync }),
    })

    await type('4284013')
    await userEvent.click(screen.getByText('Bloodbath'))

    await waitFor(() =>
      expect(flow.goManual).toHaveBeenCalledWith('4284013', null)
    )
    expect(flow.applyResolved).not.toHaveBeenCalled()
  })

  it('surfaces a lookup failure without advancing the flow', async () => {
    const level = makeCachedLevel({ inGameId: '4284013', name: 'Bloodbath' })
    const mutateAsync = vi
      .fn()
      .mockRejectedValue(new ApiError(404, 'No such level'))
    const { flow } = render({
      cached: level,
      resolve: resolveMutation({ mutateAsync }),
    })

    await type('4284013')
    await userEvent.click(screen.getByText('Bloodbath'))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('No such level')
    )
    expect(flow.applyResolved).not.toHaveBeenCalled()
  })

  it('holds a freshly seeded level for confirmation instead of applying it', async () => {
    const level = makeCachedLevel({ inGameId: '4284013', name: 'Bloodbath' })
    const mutateAsync = vi
      .fn()
      .mockResolvedValue(makeResolveResponse({ level }))
    const { flow } = render({
      cached: undefined,
      resolve: resolveMutation({ mutateAsync }),
    })

    await type('4284013')
    await userEvent.click(
      screen.getByRole('button', { name: /Fetch level 4284013/ })
    )

    // The user typed a raw id with no name visible, so the row is shown for
    // confirmation rather than applied outright.
    expect(await screen.findByText('Bloodbath')).toBeInTheDocument()
    expect(flow.applyResolved).not.toHaveBeenCalled()

    await userEvent.click(screen.getByText('Bloodbath'))
    expect(flow.applyResolved).toHaveBeenCalled()
  })

  it('closes the flow on cancel', async () => {
    const { flow } = render()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(flow.close).toHaveBeenCalled()
  })
})
