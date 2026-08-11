import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ImportCheckResponse } from '@/lib/api/import'
import { EMPTY_CHECK_RESULT, RANKING_MERGE_KEY } from '../importWizardModel'
import { useListMergeResolution } from '../useListMergeResolution'
import { listMerge } from './fixtures'

const checkResult = (
  overrides: Partial<ImportCheckResponse> = {}
): ImportCheckResponse => ({ ...EMPTY_CHECK_RESULT, ...overrides })

describe('useListMergeResolution', () => {
  const render = () => renderHook(() => useListMergeResolution())

  /** Stores the given merges and begins the walk. */
  const beginWith = (overrides: Partial<ImportCheckResponse>) => {
    const view = render()
    act(() => {
      view.result.current.store(checkResult(overrides))
      view.result.current.begin()
    })
    return view
  }

  describe('the board queue', () => {
    it('starts empty', () => {
      const { result } = render()

      expect(result.current.hasMerges).toBe(false)
      expect(result.current.current).toBeNull()
    })

    it('queues one board per conflicting collection', () => {
      const { result } = beginWith({
        collectionsMerge: [
          listMerge({ list: 'Favorites' }),
          listMerge({ list: 'Extreme Demons' }),
        ],
      })

      expect(result.current.hasMerges).toBe(true)
      expect(result.current.current!.key).toBe('Favorites')
    })

    // Ranking has no collection name, so it is keyed by the sentinel and
    // queued last — after every collection board.
    it('queues ranking last, under the sentinel key', () => {
      const { result } = beginWith({
        collectionsMerge: [listMerge({ list: 'Favorites' })],
        rankingMerge: listMerge({ list: null }),
      })

      act(() => result.current.confirmAndAdvance(['1']))

      expect(result.current.current!.key).toBe(RANKING_MERGE_KEY)
    })

    it('queues ranking alone when no collection conflicted', () => {
      const { result } = beginWith({ rankingMerge: listMerge({ list: null }) })

      expect(result.current.current!.key).toBe(RANKING_MERGE_KEY)
    })

    it('carries the merge itself alongside its key', () => {
      const merge = listMerge({ list: 'Favorites' })
      const { result } = beginWith({ collectionsMerge: [merge] })

      expect(result.current.current!.merge).toBe(merge)
    })

    it('reports no merges for a check that found none', () => {
      const { result } = beginWith({})

      expect(result.current.hasMerges).toBe(false)
    })
  })

  describe('walking the boards', () => {
    it('records an order and moves to the next board', () => {
      const { result } = beginWith({
        collectionsMerge: [
          listMerge({ list: 'Favorites' }),
          listMerge({ list: 'Extreme Demons' }),
        ],
      })

      let orders: Map<string, string[]> | null = 'unset' as never
      act(() => {
        orders = result.current.confirmAndAdvance(['3', '2', '1'])
      })

      expect(orders).toBeNull()
      expect(result.current.current!.key).toBe('Extreme Demons')
    })

    it('hands back every order when the last board is confirmed', () => {
      const { result } = beginWith({
        collectionsMerge: [
          listMerge({ list: 'Favorites' }),
          listMerge({ list: 'Extreme Demons' }),
        ],
      })
      act(() => result.current.confirmAndAdvance(['3', '2']))

      let orders: Map<string, string[]> | null = null
      act(() => {
        orders = result.current.confirmAndAdvance(['9'])
      })

      expect([...orders!.entries()]).toEqual([
        ['Favorites', ['3', '2']],
        ['Extreme Demons', ['9']],
      ])
    })

    it('keys the ranking order by the sentinel', () => {
      const { result } = beginWith({ rankingMerge: listMerge({ list: null }) })

      let orders: Map<string, string[]> | null = null
      act(() => {
        orders = result.current.confirmAndAdvance(['5', '4'])
      })

      expect(orders!.get(RANKING_MERGE_KEY)).toEqual(['5', '4'])
    })

    it('completes immediately when only one board was queued', () => {
      const { result } = beginWith({
        collectionsMerge: [listMerge({ list: 'Favorites' })],
      })

      let orders: Map<string, string[]> | null = null
      act(() => {
        orders = result.current.confirmAndAdvance(['1'])
      })

      expect(orders).not.toBeNull()
    })

    it('has nothing to confirm when the queue is empty', () => {
      const { result } = beginWith({})

      let orders: Map<string, string[]> | null = 'unset' as never
      act(() => {
        orders = result.current.confirmAndAdvance(['1'])
      })

      expect(orders).toBeNull()
    })

    it('records an empty order rather than skipping the board', () => {
      const { result } = beginWith({
        collectionsMerge: [listMerge({ list: 'Favorites' })],
      })

      let orders: Map<string, string[]> | null = null
      act(() => {
        orders = result.current.confirmAndAdvance([])
      })

      expect(orders!.get('Favorites')).toEqual([])
    })
  })

  describe('restarting and cancelling', () => {
    it('returns to the first board with a clean slate', () => {
      const { result } = beginWith({
        collectionsMerge: [
          listMerge({ list: 'Favorites' }),
          listMerge({ list: 'Extreme Demons' }),
        ],
      })
      act(() => result.current.confirmAndAdvance(['1']))

      act(() => result.current.begin())

      expect(result.current.current!.key).toBe('Favorites')

      let orders: Map<string, string[]> | null = null
      act(() => result.current.confirmAndAdvance(['2']))
      act(() => {
        orders = result.current.confirmAndAdvance(['3'])
      })

      expect(orders!.get('Favorites')).toEqual(['2'])
    })

    it('drops every merge on reset', () => {
      const { result } = beginWith({
        collectionsMerge: [listMerge({ list: 'Favorites' })],
        rankingMerge: listMerge({ list: null }),
      })

      act(() => result.current.reset())

      expect(result.current.hasMerges).toBe(false)
      expect(result.current.current).toBeNull()
    })
  })

  // Same reason as useConflictResolution: the flow's callbacks depend on it.
  it('keeps a stable identity across unrelated re-renders', () => {
    const { result, rerender } = render()
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })
})
