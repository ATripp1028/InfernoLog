// Shared helpers for the frontend test suite, in two halves: the hook-spec
// helpers (a react-query wrapper for renderHook, stubs for the two react-query
// result shapes our hooks consume, and fixture builders for the API payloads
// those hooks are handed), then the component-spec helpers below the divider
// (renderWithProviders, setViewport).
//
// Only ever imported from `**/tests/*.spec.ts(x)` files.

import type { ReactElement, ReactNode } from 'react'
import { vi } from 'vitest'
import { render, type RenderResult } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  type AnyRouter,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import {
  CollectionType,
  Device,
  EntryVisibility,
  LevelProgressStatus,
  LevelType,
  ProgressUpdateKind,
  type CollectionDetail,
  type CollectionEntry,
  type CollectionSummary,
} from '@infernolog/core'
import { ApiError } from '@/lib/api/client'
import type { useEscalation } from '@/features/search/useEscalation'
import type {
  Level,
  LevelSearchResult,
  ResolveLevelResponse,
} from '@/lib/api/logging'
import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'
import type { MeData } from '@/lib/api/me'
import type { ListItem } from '@/features/list/types'
import type { FlowContextValue } from '@/features/logging/useLoggingFlowState'
import { emptyDraft } from '@/features/logging/types'

type Escalation = ReturnType<typeof useEscalation>

/**
 * A `renderHook` wrapper providing a fresh QueryClient.
 *
 * Needed by any hook that calls a real react-query API — notably
 * `useMutationState`, which our hooks use to observe in-flight writes and
 * which cannot be stubbed the way the query/mutation hooks themselves are.
 * Retries are off so a rejected mutation surfaces on the first tick.
 */
export function queryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

/**
 * A stand-in for `useQuery`'s result, defaulting to "loaded, no data".
 *
 * Pass whichever fields the hook under test reads — the rest are filled in
 * with the settled-and-empty values.
 */
export function stubQuery<T>(
  // `data` keeps its real type (and drives inference); everything else takes
  // an untyped value, since a bare `vi.fn()` does not satisfy react-query's
  // precise `refetch` signature and making tests satisfy it buys nothing.
  // Keys are still constrained, so a typo'd flag is caught.
  overrides: Partial<Record<keyof UseQueryResult<T>, unknown>> & {
    // Explicitly `| undefined`: the repo runs exactOptionalPropertyTypes, and
    // spelling out `data: undefined` is how a test says "not loaded yet".
    data?: T | undefined
  } = {}
): UseQueryResult<T> {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isLoading: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
    ...overrides,
  } as UseQueryResult<T>
}

/**
 * A stand-in for `useMutation`'s result, defaulting to idle.
 *
 * `mutate` and `mutateAsync` are fresh spies unless overridden. Declare the
 * spy in the test when you need to assert on it, so it keeps its `Mock` type:
 *
 * ```ts
 * const mutateAsync = vi.fn().mockResolvedValue(detail)
 * vi.mocked(useAddCollectionEntry).mockReturnValue(stubMutation({ mutateAsync }))
 * ```
 */
export function stubMutation<
  TData = unknown,
  TVariables = unknown,
  TContext = unknown,
>(
  // Deliberately untyped values: a bare `vi.fn()` does not satisfy react-query's
  // precise mutate signatures, and making tests satisfy them buys nothing.
  overrides: Partial<
    Record<keyof UseMutationResult<TData, Error, TVariables, TContext>, unknown>
  > = {}
): UseMutationResult<TData, Error, TVariables, TContext> {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    status: 'idle',
    data: undefined,
    error: null,
    variables: undefined,
    ...overrides,
  } as unknown as UseMutationResult<TData, Error, TVariables, TContext>
}

/**
 * An {@link ApiError} carrying a machine-readable code in its body, the shape
 * `collectionErrorCode` reads.
 */
export function apiError(
  status: number,
  message: string,
  body: unknown = { error: message }
): ApiError {
  return new ApiError(status, message, body)
}

let levelSeq = 0

/**
 * A `LevelListSummary` — the trimmed level metadata embedded in list rows and collection entries.
 */
export function makeLevel(
  overrides: Partial<CollectionEntry['level']> = {}
): CollectionEntry['level'] {
  const inGameId = String(1000000 + levelSeq++)
  return {
    inGameId,
    name: `Level ${inGameId}`,
    creator: 'Creator',
    levelType: LevelType.CLASSIC,
    inGameDifficulty: 'EXTREME_DEMON',
    stars: 10,
    isDemon: true,
    isRated: true,
    featured: false,
    epicValue: 0,
    length: 'LONG',
    songName: null,
    songAuthor: null,
    coins: null,
    coinsVerified: null,
    twoPlayer: null,
    gameVersion: null,
    ...overrides,
  }
}

/**
 * A full `Level`, as the by-id cache lookup returns it.
 *
 * Only the fields the UI reads are populated — the rest of the row (song
 * metadata, list references, sync bookkeeping) is elided, so this is for
 * feeding hooks, not for asserting against a real API payload.
 */
export function makeCachedLevel(overrides: Partial<Level> = {}): Level {
  return { ...makeLevel(), ...overrides } as unknown as Level
}

/**
 * A `GlobalLevelPageData` — the cached level plus the three fields the Global
 * Level Page adds. Same elision as {@link makeCachedLevel}.
 */
export function makeGlobalLevel(
  overrides: Partial<GlobalLevelPageData> = {}
): GlobalLevelPageData {
  return {
    ...makeCachedLevel(),
    delistedAt: null,
    lastCheckedAt: '2026-01-01T00:00:00.000Z',
    hasUserProgress: false,
    ...overrides,
  } as GlobalLevelPageData
}

/**
 * A row as `useLevelSearch` returns it.
 */
export function makeSearchResult(
  overrides: Partial<LevelSearchResult> = {}
): LevelSearchResult {
  const inGameId = String(2000000 + levelSeq++)
  return {
    inGameId,
    name: `Level ${inGameId}`,
    creator: 'Creator',
    songName: null,
    inGameDifficulty: 'EXTREME_DEMON',
    stars: 10,
    featured: false,
    epicValue: 0,
    isRated: true,
    ...overrides,
  }
}

/**
 * A collection entry. Supply `id` whenever the test reorders or removes it — the drag helpers key on entry ids.
 */
export function makeEntry(
  overrides: Partial<CollectionEntry> = {}
): CollectionEntry {
  return {
    id: `entry-${levelSeq}`,
    rankingIndex: 1,
    addedAt: new Date('2026-01-01T00:00:00Z'),
    level: makeLevel(),
    badge: null,
    completed: false,
    ...overrides,
  }
}

/**
 * A custom collection with its entries. Pass `type` for a built-in.
 */
export function makeCollectionDetail(
  overrides: Partial<CollectionDetail> = {}
): CollectionDetail {
  return {
    id: 'collection-1',
    name: 'My Collection',
    type: CollectionType.CUSTOM,
    description: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    entries: [],
    ...overrides,
  }
}

/**
 * An index-card summary, as `useCollections` returns it.
 */
export function makeCollectionSummary(
  overrides: Partial<CollectionSummary> = {}
): CollectionSummary {
  return {
    id: 'collection-1',
    name: 'My Collection',
    type: CollectionType.CUSTOM,
    description: null,
    entryCount: 0,
    previewLevelIds: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

/**
 * A `useResolveLevel()` payload. `existingCompletion` non-null is what both dialogs read as "already beaten".
 */
export function makeResolveResponse(
  overrides: Partial<ResolveLevelResponse> = {}
): ResolveLevelResponse {
  return {
    level: makeCachedLevel({ inGameId: '12345' }),
    fallbackToManual: false,
    suggestedGddlTier: null,
    existingCompletion: null,
    ...overrides,
  } as ResolveLevelResponse
}

/**
 * A `MeData` — the signed-in user as `useMe()` returns it.
 *
 * Defaults to a simple-rating user on the 0–10 scale with no GDDL key and no
 * username cooldown, which is the shape most surfaces are written against.
 */
export function makeMe(overrides: Partial<MeData> = {}): MeData {
  return {
    id: 'user-1',
    username: 'someone',
    usernameChangedAt: null,
    email: 'someone@example.com',
    discordId: null,
    profilePublic: false,
    discordPublic: false,
    ratingMode: 'SIMPLE',
    ratingDisplayScale: 'ZERO_TO_TEN',
    defaultFps: 60,
    defaultPercentageVersion: 'TWO_TWO',
    defaultDevice: 'pc',
    dateFormatPreference: 'ISO',
    showHighlightUrl: false,
    autoExpandFabLabels: false,
    includeEnjoyment: false,
    enjoymentWeight: 1,
    enjoymentSortOrder: 0,
    hasGddlApiKey: false,
    gddlUsername: null,
    ratingCategories: [],
    onboardingCompleted: true,
    legalAcceptedAt: '2026-01-01T00:00:00.000Z',
    isVerified: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/**
 * A `ListItem` — one row of the List, as the progress query returns it.
 *
 * `entry` holds the per-run fields the row renders; pass `entry: null` for the
 * rare status row with no progress updates. Dates are real `Date`s and the
 * enum fields are real enum members, so a spec that gets either wrong fails at
 * typecheck rather than rendering something the API could never produce.
 */
export function makeListItem(overrides: Partial<ListItem> = {}): ListItem {
  const level = makeLevel()
  const at = new Date('2026-01-01T00:00:00.000Z')
  return {
    levelProgressId: `progress-${level.inGameId}`,
    status: LevelProgressStatus.COMPLETED,
    visibility: EntryVisibility.PUBLIC,
    createdAt: at,
    updatedAt: at,
    worstFail: null,
    needsPlacement: false,
    userGddlTier: null,
    overallRating: null,
    ratingScores: [],
    level,
    entry: {
      progressUpdateId: 'update-1',
      kind: ProgressUpdateKind.COMPLETION,
      date: null,
      dateTimezone: null,
      dateUncertain: false,
      attempts: null,
      percentage: null,
      runFrom: null,
      runTo: null,
      enjoyment: null,
      difficultyOpinion: null,
      onStream: false,
      fps: null,
      percentageVersion: null,
      videoUrl: null,
      highlightUrl: null,
      notes: null,
      device: null,
      loggedAt: at,
    },
    ...overrides,
  }
}

/** Re-exported so a spec can build List fixtures without a second core import. */
export { Device, LevelProgressStatus }

/**
 * A `useLoggingFlow()` value with every action spied and a fresh empty draft.
 *
 * Steps take no props and read everything from this context, so a step spec
 * drives its render entirely through what this returns.
 */
export function stubLoggingFlow(
  overrides: Partial<FlowContextValue> = {}
): FlowContextValue {
  return {
    isOpen: true,
    path: 'completion',
    step: 'c_review',
    level: null,
    existingCompletion: null,
    suggestedGddlTier: null,
    manualLevelId: null,
    pendingEditLevelId: null,
    lastCompletionLevelProgressId: null,
    isBusy: false,
    draft: emptyDraft(),
    open: vi.fn(),
    openForEdit: vi.fn(),
    close: vi.fn(),
    setStep: vi.fn(),
    setLastCompletion: vi.fn(),
    setBusy: vi.fn(),
    patchDraft: vi.fn(),
    applyResolved: vi.fn(),
    goManual: vi.fn(),
    applyManualLevel: vi.fn(),
    ...overrides,
  }
}

/**
 * A `useEscalation()` return value with spied `escalate`/`clear`. Both collection dialogs clear it whenever the query changes.
 */
export function stubEscalation(
  overrides: Partial<Escalation> = {}
): Escalation {
  return {
    escalatedQuery: null,
    escalate: vi.fn(),
    clear: vi.fn(),
    isPending: false,
    isError: false,
    result: null,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Component rendering
//
// Everything above this line serves hook specs. Everything below serves
// component specs — see docs/CODE_QUALITY.md, Frontend §7 for which
// components are worth rendering at all.
// ─────────────────────────────────────────────────────────────────────

/** Options for {@link renderWithProviders}. */
export interface RenderWithProvidersOptions {
  /**
   * Mount a memory-history router around the tree. Required by anything
   * rendering `Link` or calling `useNavigate`; omit it otherwise, since the
   * router costs an async render.
   */
  router?: boolean
  /** Where the memory router starts. Only meaningful with `router: true`. */
  initialPath?: string
  /** Reuse a client across renders; one is created per call otherwise. */
  queryClient?: QueryClient
}

/**
 * What {@link renderWithProviders} adds to Testing Library's render result.
 *
 * `router` is present only when the render asked for one. Assert navigation
 * through `router.state.location.pathname` rather than spying on
 * `useNavigate`, so the assertion covers the arguments the component actually
 * passed rather than the ones the spec expected it to.
 */
export type RenderWithProvidersResult = RenderResult & {
  queryClient: QueryClient
  router: AnyRouter
}

/**
 * Renders a component inside the providers a real mount would give it.
 *
 * Always provides react-query. Pass `router: true` for anything that renders
 * `Link` or calls `useNavigate` — that path is async, so `await` the call:
 *
 * ```tsx
 * const { getByRole } = await renderWithProviders(<CollectionCard … />, { router: true })
 * ```
 *
 * Deliberately does NOT provide `AuthProvider` or `FabActionsProvider`. Both
 * reach for real infrastructure on mount — Amplify's `fetchAuthSession` and the
 * default FAB actions' `lib/api` hooks respectively — so a spec needing either
 * mocks the module instead, the same way it mocks any other boundary.
 *
 * @returns Testing Library's result plus the `QueryClient` in play, for specs
 * that need to seed or inspect the cache.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions & { router: true }
): Promise<RenderWithProvidersResult>
export function renderWithProviders(
  ui: ReactElement,
  options?: RenderWithProvidersOptions & { router?: false }
): RenderResult & { queryClient: QueryClient }
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {}
):
  | (RenderResult & { queryClient: QueryClient })
  | Promise<RenderWithProvidersResult> {
  const queryClient =
    options.queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

  const withQuery = (node: ReactNode) => (
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  )

  if (!options.router) {
    return { ...render(withQuery(ui)), queryClient }
  }

  // A bare root route rendering the component in place of an Outlet is the
  // whole tree. The app's real routes are deliberately NOT mirrored here:
  // `Link` interpolates params and builds its href from the `to` string alone,
  // without consulting the route tree, so registering them changes no
  // behaviour — an earlier version of this helper carried a hand-copied list
  // of every path in `src/routes/` and every spec passed identically without
  // it. (Importing the real tree is not an option either: `routeTree.gen.ts`
  // is gitignored and generated by `tsr generate`, which runs in `build` and
  // `typecheck` but not `test` — and CI's test job is a separate checkout from
  // its build job, so a spec importing it would pass locally and fail in CI.)
  //
  // The consequence to know: a typo'd `to` renders that typo as an href rather
  // than failing. Assert the href you expect.
  const rootRoute = createRootRoute({ component: () => withQuery(ui) })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: [options.initialPath ?? '/'],
    }),
  })

  return router.load().then(() => ({
    ...render(<RouterProvider router={router} />),
    queryClient,
    router: router as AnyRouter,
  }))
}

/**
 * Points `window.matchMedia` at a fixed breakpoint answer for this test.
 *
 * `useMediaQuery` starts at `false` and reads `matchMedia` in an effect, so a
 * component branching on it renders its mobile layout unless told otherwise.
 * Call this before rendering; `unstubGlobals` in `vitest.config.ts` unwinds it
 * after each test (`restoreMocks` does not — it only covers `vi.spyOn`).
 *
 * @param viewport - `desktop` matches every `min-width` query, `mobile` none.
 */
export function setViewport(viewport: 'desktop' | 'mobile') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: viewport === 'desktop' && query.includes('min-width'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}
