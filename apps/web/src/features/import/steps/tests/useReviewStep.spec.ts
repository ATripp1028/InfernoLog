import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_FLAGS,
  completionRow,
  droppedRow,
  flag,
  importFlowStub,
  listRow,
  parseResult,
  progressRow,
  rankingRow,
  ratingRow,
} from '../../tests/fixtures'

// The hook reads everything through the flow context; stubbing that one
// module is enough to drive it.
vi.mock('../../ImportFlowProvider', () => ({ useImportFlow: vi.fn() }))

const { useImportFlow } = await import('../../ImportFlowProvider')
const { useReviewStep } = await import('../useReviewStep')

let flow: Record<string, unknown>

beforeEach(() => {
  flow = importFlowStub()
  vi.mocked(useImportFlow).mockImplementation(() => flow as never)
})

describe('useReviewStep', () => {
  const render = () => renderHook(() => useReviewStep())

  const withRows = (result: ReturnType<typeof parseResult>) => {
    flow.parseResult = result
    return render()
  }

  describe('what will import', () => {
    it('counts the rows that survived parsing on each tab', () => {
      const { result } = withRows(
        parseResult({
          completions: [completionRow(), completionRow()],
          progress: [progressRow()],
          dropped: [droppedRow()],
        })
      )

      expect(result.current.validCompletions).toHaveLength(2)
      expect(result.current.validProgress).toHaveLength(1)
      expect(result.current.validDropped).toHaveLength(1)
      expect(result.current.totalValid).toBe(4)
    })

    it('excludes rows carrying a parse error', () => {
      const { result } = withRows(
        parseResult({
          completions: [
            completionRow(),
            completionRow({ flags: [flag({ severity: 'error' })] }),
          ],
        })
      )

      expect(result.current.validCompletions).toHaveLength(1)
    })

    // A warning drops only the flagged value, so its row still imports.
    it('includes a row whose only flag is a warning', () => {
      const { result } = withRows(
        parseResult({
          completions: [
            completionRow({ flags: [flag({ severity: 'warning' })] }),
          ],
        })
      )

      expect(result.current.validCompletions).toHaveLength(1)
    })

    it('excludes a row identifying no level', () => {
      const { result } = withRows(
        parseResult({ completions: [completionRow({ data: {} })] })
      )

      expect(result.current.validCompletions).toEqual([])
    })

    it('counts the ranking, lists, and ratings tabs separately', () => {
      const { result } = withRows(
        parseResult({
          ranking: [rankingRow()],
          lists: [listRow(), listRow()],
          ratings: [ratingRow()],
        })
      )

      expect(result.current.totalRanked).toBe(1)
      expect(result.current.totalListed).toBe(2)
      expect(result.current.totalRated).toBe(1)
      // Those tabs are counted, but they are not "rows" in the row total.
      expect(result.current.totalValid).toBe(0)
    })

    it('excludes a list row with no collection name', () => {
      const { result } = withRows({
        ...parseResult({ lists: [listRow({ list: null })] }),
      })

      expect(result.current.totalListed).toBe(0)
    })

    it('excludes a rating row with no scores', () => {
      const { result } = withRows(
        parseResult({ ratings: [ratingRow({ scores: {} })] })
      )

      expect(result.current.totalRated).toBe(0)
    })
  })

  describe('what will be skipped', () => {
    it('counts error flags and duplicates together', () => {
      flow.allFlags = {
        ...EMPTY_FLAGS,
        completions: [flag({ severity: 'error' })],
        duplicates: [
          { tab: 'completions' as const, levelId: '1', rows: [0, 1] },
        ],
      }
      const { result } = render()

      expect(result.current.totalSkipped).toBe(2)
    })

    it('does not count warnings as skipped', () => {
      flow.allFlags = {
        ...EMPTY_FLAGS,
        completions: [flag({ severity: 'warning' })],
      }
      const { result } = render()

      expect(result.current.totalSkipped).toBe(0)
    })
  })

  // Two flavours of warning read very differently to a user: "we'll find this
  // level by name" (the row is fine) versus "we dropped this value".
  describe('the two flavours of warning', () => {
    beforeEach(() => {
      flow.allFlags = {
        ...EMPTY_FLAGS,
        completions: [
          flag({ severity: 'warning', field: 'level_id' }),
          flag({ severity: 'warning', field: 'attempts' }),
          flag({ severity: 'error', field: 'level_id' }),
        ],
        progress: [flag({ severity: 'warning', field: 'level_id' })],
      }
    })

    it('separates name-resolution warnings from dropped values', () => {
      const { result } = render()

      expect(result.current.totalNameOnly).toBe(2)
      expect(result.current.totalDataWarn).toBe(1)
    })

    it('groups each flavour by the tab it came from', () => {
      const { result } = render()

      expect(result.current.nameOnlyByTab.completions).toHaveLength(1)
      expect(result.current.nameOnlyByTab.progress).toHaveLength(1)
      expect(result.current.dataWarnByTab.completions).toHaveLength(1)
      expect(result.current.dataWarnByTab.progress).toEqual([])
    })

    it('keeps errors out of both warning groups', () => {
      const { result } = render()

      expect(result.current.errorFlags).toHaveLength(1)
      expect(result.current.errorFlagsByTab.completions).toHaveLength(1)
    })

    it('gives every tab a key, even the empty ones', () => {
      const { result } = render()

      expect(Object.keys(result.current.nameOnlyByTab).sort()).toEqual([
        'completions',
        'dropped',
        'lists',
        'progress',
        'ranking',
        'ratings',
      ])
    })
  })

  describe('the step controls', () => {
    it('sends the user back to upload to try another file', () => {
      const { result } = render()

      act(() => result.current.onReUpload())

      expect(flow.setStep).toHaveBeenCalledWith('upload')
    })

    it('offers the override checkbox for an existing account', () => {
      const { result } = render()

      expect(result.current.showOverrideOption).toBe(true)
    })

    // Onboarding: a brand-new account has nothing to conflict with, so the
    // checkbox is hidden rather than shown disabled.
    it('hides the override checkbox during onboarding', () => {
      flow.skipConflictCheck = true
      const { result } = render()

      expect(result.current.showOverrideOption).toBe(false)
    })

    it('passes the commit action straight through', () => {
      const { result } = render()

      expect(result.current.handleSkipFlagged).toBe(flow.handleSkipFlagged)
    })
  })

  it('survives a parse result that has not landed yet', () => {
    flow.parseResult = null
    const { result } = render()

    expect(result.current.totalValid).toBe(0)
    expect(result.current.totalRanked).toBe(0)
  })
})
