import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LevelProgressListItem } from '@infernolog/core'
import { queryWrapper } from '@/utils/testUtils'
import { logQueryKey, useCachedLogRow } from '../log'

// The hook exists to answer from cache on the first render and never to fetch:
// the level page uses it to pick its FAB actions before its own query lands,
// so a request here would defeat the point and a stray fetch would put a
// second /v1/me/progress call on every level page.

const row = (inGameId: string): LevelProgressListItem =>
  ({ level: { inGameId }, status: 'IN_PROGRESS' }) as LevelProgressListItem

function render(levelId: string, cached?: LevelProgressListItem[]) {
  const { queryClient, wrapper } = queryWrapper()
  if (cached) queryClient.setQueryData(logQueryKey, cached)
  return renderHook(() => useCachedLogRow(levelId), { wrapper })
}

describe('useCachedLogRow', () => {
  it('finds the level’s row in the cached Log', () => {
    const { result } = render('128', [row('999'), row('128')])

    expect(result.current).toEqual({ known: true, row: row('128') })
  })

  // The distinction the caller acts on: a cached Log that has no row for the
  // level is evidence the user never logged it.
  it('reports the Log as known even with no row for the level', () => {
    const { result } = render('128', [row('999')])

    expect(result.current).toEqual({ known: true, row: undefined })
  })

  it('knows nothing when the Log was never cached', () => {
    const { result } = render('128')

    expect(result.current).toEqual({ known: false, row: undefined })
  })

  it('never fetches the Log itself', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { result } = render('128')
    // Give a fetch a chance to be scheduled before concluding none was.
    await waitFor(() => expect(result.current.known).toBe(false))

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
