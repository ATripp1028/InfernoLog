import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ImportCheckResponse,
  ImportStatusResponse,
} from '@/lib/api/import'
import type { MeData } from '@/lib/api/me'
import { queryWrapper, stubQuery } from '@/utils/testUtils'
import { EMPTY_CHECK_RESULT, RANKING_MERGE_KEY } from '../importWizardModel'
import type { AllFlags } from '../importWizardModel'
import {
  completionRow,
  flag,
  listMerge,
  parseResult,
  ratingConflict,
  rowConflict,
} from './fixtures'

// The two API calls and the status poll are the flow's only outside world;
// buildCheckRequest / buildImportPayload stay real so the payload assertions
// below exercise the actual builders.
vi.mock('@/lib/api/import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/import')>()),
  useImportApi: vi.fn(),
  useImportStatus: vi.fn(),
}))

const { useImportApi, useImportStatus, importStatusQueryKey } =
  await import('@/lib/api/import')
const { useImportFlowState } = await import('../useImportFlowState')

const me = { dateFormatPreference: 'DMY' } as MeData

const emptyFlags: AllFlags = {
  completions: [],
  progress: [],
  dropped: [],
  ranking: [],
  lists: [],
  ratings: [],
  duplicates: [],
}

const checkResult = (
  overrides: Partial<ImportCheckResponse> = {}
): ImportCheckResponse => ({ ...EMPTY_CHECK_RESULT, ...overrides })

let checkConflicts: ReturnType<typeof vi.fn>
let startImport: ReturnType<typeof vi.fn>
let refetch: ReturnType<typeof vi.fn>

/** Points the status poll at a given job state. */
function statusIs(data: Partial<ImportStatusResponse> | null) {
  vi.mocked(useImportStatus).mockReturnValue(
    stubQuery<ImportStatusResponse | null>({
      data: data as ImportStatusResponse | null,
      refetch,
    })
  )
}

beforeEach(() => {
  checkConflicts = vi.fn().mockResolvedValue(checkResult())
  startImport = vi.fn().mockResolvedValue({ jobId: 'job-1' })
  refetch = vi.fn()
  vi.mocked(useImportApi).mockReturnValue({
    checkConflicts,
    startImport,
  } as never)
  statusIs(null)
})

function render(skipConflictCheck = false) {
  const { queryClient, wrapper } = queryWrapper()
  const view = renderHook(() => useImportFlowState({ me, skipConflictCheck }), {
    wrapper,
  })
  return { ...view, queryClient }
}

/** Renders and walks upload → review with the given parsed workbook. */
function atReview(
  result: ReturnType<typeof parseResult> = parseResult({
    completions: [completionRow()],
  }),
  skipConflictCheck = false
) {
  const view = render(skipConflictCheck)
  act(() => view.result.current.handleParsed(result, emptyFlags))
  return view
}

/** The payload handed to /import/start by the most recent commit. */
const committed = () => startImport.mock.calls[0]![0]

describe('useImportFlowState', () => {
  describe('upload', () => {
    it('starts on the upload step', () => {
      const { result } = render()

      expect(result.current.step).toBe('upload')
      expect(result.current.parseResult).toBeNull()
    })

    // The sheet carries no format marker, so the user's stored preference is
    // the starting guess rather than a hardcoded default.
    it('seeds the date format from the user preference', () => {
      const { result } = render()

      expect(result.current.dateFormat).toBe('DMY')
    })

    it('moves to review once a workbook is parsed', () => {
      const parsed = parseResult({ completions: [completionRow()] })
      const { result } = render()

      act(() => result.current.handleParsed(parsed, emptyFlags))

      expect(result.current.step).toBe('review')
      expect(result.current.parseResult).toBe(parsed)
      expect(result.current.allFlags).toBe(emptyFlags)
    })
  })

  describe('review → the conflict check', () => {
    it('checks conflicts before committing', async () => {
      const { result } = atReview()

      await act(async () => result.current.handleSkipFlagged())

      expect(checkConflicts).toHaveBeenCalledOnce()
    })

    // Error-flagged rows are what the review step warned about; a warning
    // only drops the flagged value, so its row still goes.
    it('sends only rows that survived parsing', async () => {
      const { result } = atReview(
        parseResult({
          completions: [
            completionRow({ rowIndex: 0, data: { levelId: '1' } }),
            completionRow({
              rowIndex: 1,
              data: { levelId: '2' },
              flags: [flag({ severity: 'error' })],
            }),
            completionRow({
              rowIndex: 2,
              data: { levelId: '3' },
              flags: [flag({ severity: 'warning' })],
            }),
            completionRow({ rowIndex: 3, data: {} }),
          ],
        })
      )

      await act(async () => result.current.handleSkipFlagged())

      expect(
        checkConflicts.mock.calls[0]![0].completions.map(
          (r: { rowIndex: number }) => r.rowIndex
        )
      ).toEqual([0, 2])
    })

    // A workbook with nothing importable has nothing to conflict with, so the
    // round trip is skipped rather than sending an empty request.
    it('skips the round trip for a workbook with no importable rows', async () => {
      const { result } = atReview(parseResult())

      await act(async () => result.current.handleSkipFlagged())

      expect(checkConflicts).not.toHaveBeenCalled()
      expect(startImport).toHaveBeenCalledOnce()
    })

    // Onboarding: a brand-new account has no existing data to conflict with.
    it('skips the check entirely for a new account', async () => {
      const { result } = atReview(undefined, true)

      await act(async () => result.current.handleSkipFlagged())

      expect(checkConflicts).not.toHaveBeenCalled()
      expect(result.current.step).toBe('committing')
    })

    it('commits straight away when the check finds nothing', async () => {
      const { result } = atReview()

      await act(async () => result.current.handleSkipFlagged())

      expect(result.current.step).toBe('committing')
      expect(startImport).toHaveBeenCalledOnce()
    })

    it('does nothing before a workbook has been parsed', async () => {
      const { result } = render()

      await act(async () => result.current.handleSkipFlagged())

      expect(checkConflicts).not.toHaveBeenCalled()
      expect(result.current.step).toBe('upload')
    })
  })

  describe('routing out of the check', () => {
    it('opens the field resolver when the check found conflicts', async () => {
      checkConflicts.mockResolvedValue(
        checkResult({ completionConflicts: [rowConflict()] })
      )
      const { result } = atReview()

      await act(async () => result.current.handleSkipFlagged())

      expect(result.current.step).toBe('resolve-conflicts')
      expect(result.current.conflictSubStep).toBe('completions')
      expect(result.current.completionConflicts).toHaveLength(1)
      expect(startImport).not.toHaveBeenCalled()
    })

    it('opens the merge boards when only list orders disagree', async () => {
      checkConflicts.mockResolvedValue(
        checkResult({ collectionsMerge: [listMerge({ list: 'Favorites' })] })
      )
      const { result } = atReview()

      await act(async () => result.current.handleSkipFlagged())

      expect(result.current.step).toBe('resolve-lists')
      expect(result.current.currentListMerge!.key).toBe('Favorites')
    })

    it('treats a ranking merge as reason enough to open the boards', async () => {
      checkConflicts.mockResolvedValue(
        checkResult({ rankingMerge: listMerge({ list: null }) })
      )
      const { result } = atReview()

      await act(async () => result.current.handleSkipFlagged())

      expect(result.current.step).toBe('resolve-lists')
    })

    // Field conflicts come first; the merge boards run after them.
    it('resolves fields before lists when the check found both', async () => {
      checkConflicts.mockResolvedValue(
        checkResult({
          completionConflicts: [rowConflict()],
          collectionsMerge: [listMerge({ list: 'Favorites' })],
        })
      )
      const { result } = atReview()

      await act(async () => result.current.handleSkipFlagged())

      expect(result.current.step).toBe('resolve-conflicts')

      await act(async () =>
        result.current.handleCompletionConflictsResolved(new Map())
      )

      expect(result.current.step).toBe('resolve-lists')
    })
  })

  describe('the blanket override', () => {
    // "Imported data always wins" reuses the ordinary resolution vocabulary
    // rather than a separate commit path, so the backend sees no difference.
    it('auto-resolves every conflict and commits without a resolver', async () => {
      checkConflicts.mockResolvedValue(
        checkResult({
          completionConflicts: [rowConflict({ rowIndex: 0 })],
          ratingConflicts: [ratingConflict()],
          collectionsMerge: [listMerge({ list: 'Favorites' })],
        })
      )
      const { result } = atReview()
      act(() => result.current.setBlanketOverride(true))

      await act(async () => result.current.handleSkipFlagged())

      expect(result.current.step).toBe('committing')
      expect(startImport).toHaveBeenCalledOnce()
      expect(committed().rows[0]).toMatchObject({ resolution: 'overwrite' })
    })

    it('takes the spreadsheet order for every merge', async () => {
      checkConflicts.mockResolvedValue(
        checkResult({
          collectionsMerge: [
            listMerge({
              list: 'Favorites',
              importedOrder: [
                { levelId: '9', levelName: null },
                { levelId: '8', levelName: null },
              ],
            }),
          ],
        })
      )
      const { result } = atReview()
      act(() => result.current.setBlanketOverride(true))

      await act(async () => result.current.handleSkipFlagged())

      expect(
        committed().collections.map((c: { levelId: string }) => c.levelId)
      ).toEqual(['9', '8'])
    })

    it('is off by default', () => {
      const { result } = render()

      expect(result.current.blanketOverride).toBe(false)
    })
  })

  describe('committing after manual resolution', () => {
    it('carries the field resolutions into the payload', async () => {
      checkConflicts.mockResolvedValue(
        checkResult({ completionConflicts: [rowConflict({ rowIndex: 0 })] })
      )
      const { result } = atReview()
      await act(async () => result.current.handleSkipFlagged())

      await act(async () =>
        result.current.handleCompletionConflictsResolved(
          new Map([['0', { resolution: 'drop', values: {} }]])
        )
      )

      expect(result.current.step).toBe('committing')
      expect(committed().rows[0]).toMatchObject({ resolution: 'drop' })
    })

    it('carries the merged list order into the payload', async () => {
      checkConflicts.mockResolvedValue(
        checkResult({ collectionsMerge: [listMerge({ list: 'Favorites' })] })
      )
      const { result } = atReview()
      await act(async () => result.current.handleSkipFlagged())

      await act(async () => result.current.handleListMergeConfirmed(['7', '6']))

      expect(result.current.step).toBe('committing')
      expect(
        committed().collections.map((c: { levelId: string }) => c.levelId)
      ).toEqual(['7', '6'])
    })

    it('carries the ranking order under its sentinel key', async () => {
      checkConflicts.mockResolvedValue(
        checkResult({ rankingMerge: listMerge({ list: null }) })
      )
      const { result } = atReview()
      await act(async () => result.current.handleSkipFlagged())

      await act(async () => result.current.handleListMergeConfirmed(['5']))

      expect(committed().ranking).toEqual([{ levelId: '5', levelName: null }])
      expect(RANKING_MERGE_KEY).toBe('__ranking__')
    })

    // Both sets of decisions have to survive to the commit — the list step
    // reads the field resolutions back out of the conflicts hook.
    it('keeps both sets of decisions when the flow went through each step', async () => {
      checkConflicts.mockResolvedValue(
        checkResult({
          completionConflicts: [rowConflict({ rowIndex: 0 })],
          collectionsMerge: [listMerge({ list: 'Favorites' })],
        })
      )
      const { result } = atReview()
      await act(async () => result.current.handleSkipFlagged())
      await act(async () =>
        result.current.handleCompletionConflictsResolved(
          new Map([['0', { resolution: 'drop', values: {} }]])
        )
      )

      await act(async () => result.current.handleListMergeConfirmed(['7']))

      expect(committed().rows[0]).toMatchObject({ resolution: 'drop' })
      expect(committed().collections[0]).toMatchObject({ levelId: '7' })
    })
  })

  describe('cancelling back to review', () => {
    // The only backward moves in the wizard, and both are explicit user acts.
    it('drops what the check found when the field resolver is cancelled', async () => {
      checkConflicts.mockResolvedValue(
        checkResult({ completionConflicts: [rowConflict()] })
      )
      const { result } = atReview()
      await act(async () => result.current.handleSkipFlagged())

      act(() => result.current.handleConflictsCancelled())

      expect(result.current.step).toBe('review')
      expect(result.current.completionConflicts).toEqual([])
    })

    it('drops the merges when the merge boards are cancelled', async () => {
      checkConflicts.mockResolvedValue(
        checkResult({ collectionsMerge: [listMerge({ list: 'Favorites' })] })
      )
      const { result } = atReview()
      await act(async () => result.current.handleSkipFlagged())

      act(() => result.current.handleListMergeCancelled())

      expect(result.current.step).toBe('review')
      expect(result.current.currentListMerge).toBeNull()
    })
  })

  describe('the commit and its progress', () => {
    it('reports progress from the polled job', () => {
      statusIs({ status: 'running', totalRows: 200, processedRows: 50 })
      const { result } = render()

      expect(result.current.progress).toBe(25)
    })

    it('reports no progress before the job exists', () => {
      const { result } = render()

      expect(result.current.progress).toBe(0)
    })

    it('moves to the done screen when the job completes', async () => {
      const { result, rerender } = atReview()
      await act(async () => result.current.handleSkipFlagged())

      statusIs({ status: 'completed', totalRows: 1, processedRows: 1 })
      rerender()

      await waitFor(() => expect(result.current.step).toBe('success'))
    })

    it('surfaces a failed job without leaving the committing step', async () => {
      const { result, rerender } = atReview()
      await act(async () => result.current.handleSkipFlagged())

      statusIs({ status: 'failed', error: 'Worker died' })
      rerender()

      await waitFor(() =>
        expect(result.current.commitError).toBe('Worker died')
      )
      expect(result.current.step).toBe('committing')
    })

    // A prior job's cached 'completed' status would otherwise be read as this
    // job already being done, jumping straight to the success screen. The
    // cache is wiped BEFORE the network call, since the committing step and
    // its completion effect render on that same tick.
    it('wipes the cached status before starting a new job', async () => {
      const { result, queryClient } = atReview()
      queryClient.setQueryData(importStatusQueryKey, {
        status: 'completed',
        totalRows: 1,
        processedRows: 1,
      })

      await act(async () => result.current.handleSkipFlagged())

      expect(queryClient.getQueryData(importStatusQueryKey)).toBeNull()
      expect(refetch).toHaveBeenCalled()
    })

    // Auto-navigating backward would make the step indicator revisit a step,
    // so the error is shown in place with an explicit way back.
    it('holds on committing when the start call fails', async () => {
      startImport.mockRejectedValue(new Error('Server exploded'))
      const { result } = atReview()

      await act(async () => result.current.handleSkipFlagged())

      expect(result.current.step).toBe('committing')
      expect(result.current.commitError).toBe('Server exploded')
    })

    it('holds on checking-conflicts when the check call fails', async () => {
      checkConflicts.mockRejectedValue(new Error('Check exploded'))
      const { result } = atReview()

      await act(async () => result.current.handleSkipFlagged())

      expect(result.current.step).toBe('checking-conflicts')
      expect(result.current.commitError).toBe('Check exploded')
    })

    it.each([
      ['the check', () => checkConflicts.mockRejectedValue('not an Error')],
      ['the commit', () => startImport.mockRejectedValue('not an Error')],
    ])(
      'falls back to generic copy when %s throws a non-Error',
      async (_label, setup) => {
        setup()
        const { result } = atReview()

        await act(async () => result.current.handleSkipFlagged())

        expect(result.current.commitError).toMatch(/^Failed to /)
      }
    )

    it('returns to review and clears the error on demand', async () => {
      startImport.mockRejectedValue(new Error('Server exploded'))
      const { result } = atReview()
      await act(async () => result.current.handleSkipFlagged())

      act(() => result.current.backToReview())

      expect(result.current.step).toBe('review')
      expect(result.current.commitError).toBeNull()
    })
  })
})
