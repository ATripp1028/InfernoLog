// Shared helpers for the frontend unit suite: a react-query wrapper for
// renderHook, stubs for the two react-query result shapes our hooks consume,
// and fixture builders for the API payloads those hooks are handed.
//
// Only ever imported from `**/tests/*.spec.ts(x)` files.

import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import {
  CollectionType,
  LevelType,
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
  overrides: Partial<UseQueryResult<T>> = {}
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
