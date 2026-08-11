import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import * as XLSX from 'xlsx'
import type { AllFlags } from '../importWizardModel'
import type { ParseResult } from '../parseSpreadsheet'
import {
  completionRow,
  droppedRow,
  flag,
  listRow,
  parseResult,
  progressRow,
  rankingRow,
  ratingRow,
} from './fixtures'

// Both step hooks read everything through the flow context; stubbing that one
// module is enough to drive them.
vi.mock('../ImportFlowProvider', () => ({ useImportFlow: vi.fn() }))

const { useImportFlow } = await import('../ImportFlowProvider')
const { useUploadStep } = await import('../steps/useUploadStep')
const { useReviewStep } = await import('../steps/useReviewStep')

const emptyFlags: AllFlags = {
  completions: [],
  progress: [],
  dropped: [],
  ranking: [],
  lists: [],
  ratings: [],
  duplicates: [],
}

let flow: Record<string, unknown>
// Declared apart from `flow` so it keeps its Mock type for the call-argument
// assertions below.
let handleParsed: Mock<(result: ParseResult, flags: AllFlags) => void>

beforeEach(() => {
  handleParsed = vi.fn()
  flow = {
    dateFormat: 'MDY',
    setDateFormat: vi.fn(),
    handleParsed,
    parseResult: parseResult(),
    allFlags: emptyFlags,
    handleSkipFlagged: vi.fn(),
    setStep: vi.fn(),
    skipConflictCheck: false,
    blanketOverride: false,
    setBlanketOverride: vi.fn(),
  }
  vi.mocked(useImportFlow).mockImplementation(() => flow as never)
})

describe('useUploadStep', () => {
  /**
   * A stand-in File whose bytes are a real one-tab workbook.
   *
   * jsdom's File implements no `arrayBuffer()`, which is the only thing the
   * hook calls on it — so this supplies exactly that rather than dragging in
   * a polyfill for the rest of the File API.
   */
  const xlsxFile = (rows: unknown[][]) => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(rows),
      'Completions'
    )
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    return {
      name: 'import.xlsx',
      arrayBuffer: () => Promise.resolve(buffer as ArrayBuffer),
    } as unknown as File
  }

  const render = () => renderHook(() => useUploadStep())

  it('starts idle', () => {
    const { result } = render()

    expect(result.current.parsing).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.isDragging).toBe(false)
  })

  it('parses a workbook and hands it to the flow', async () => {
    const { result } = render()

    await act(async () =>
      result.current.handleFile(xlsxFile([['level_id'], ['128']]))
    )

    expect(handleParsed).toHaveBeenCalledOnce()
    const [parsed] = handleParsed.mock.calls[0]!
    expect(parsed.completions).toHaveLength(1)
  })

  // The review step reads flags per tab, so they are flattened out of the
  // per-row structure on the way through.
  it('flattens every tab of flags for the review step', async () => {
    const { result } = render()

    await act(async () =>
      result.current.handleFile(
        xlsxFile([
          ['level_id', 'attempts'],
          ['', 'lots'],
        ])
      )
    )

    const [, flags] = handleParsed.mock.calls[0]!
    expect(flags.completions.length).toBeGreaterThan(0)
    expect(flags.progress).toEqual([])
    expect(flags.duplicates).toEqual([])
  })

  it('reports duplicates alongside the per-tab flags', async () => {
    const { result } = render()

    await act(async () =>
      result.current.handleFile(xlsxFile([['level_id'], ['128'], ['128']]))
    )

    const [, flags] = handleParsed.mock.calls[0]!
    expect(flags.duplicates).toHaveLength(1)
  })

  it('parses using the format the user chose', async () => {
    flow.dateFormat = 'DMY'
    const { result } = render()

    await act(async () =>
      result.current.handleFile(
        xlsxFile([
          ['level_id', 'date'],
          ['128', '03/04/2026'],
        ])
      )
    )

    const [parsed] = handleParsed.mock.calls[0]!
    expect(parsed.completions[0]!.data.date).toBe('2026-04-03')
  })

  it('reports a file it cannot read, without advancing the flow', async () => {
    const { result } = render()
    const broken = {
      arrayBuffer: () => Promise.reject(new Error('Unreadable file')),
    } as unknown as File

    await act(async () => result.current.handleFile(broken))

    expect(result.current.error).toBe('Unreadable file')
    expect(handleParsed).not.toHaveBeenCalled()
  })

  it('falls back to generic copy for a non-Error failure', async () => {
    const { result } = render()
    const broken = {
      arrayBuffer: () => Promise.reject('nope'),
    } as unknown as File

    await act(async () => result.current.handleFile(broken))

    expect(result.current.error).toBe('Failed to parse spreadsheet')
  })

  it('clears a previous error on the next attempt', async () => {
    const { result } = render()
    await act(async () =>
      result.current.handleFile({
        arrayBuffer: () => Promise.reject(new Error('boom')),
      } as unknown as File)
    )

    await act(async () =>
      result.current.handleFile(xlsxFile([['level_id'], ['128']]))
    )

    expect(result.current.error).toBeNull()
  })

  it('reports parsing while the file is being read', async () => {
    let release: (v: ArrayBuffer) => void = () => {}
    const slow = {
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          release = resolve
        }),
    } as unknown as File
    const { result } = render()

    act(() => void result.current.handleFile(slow))
    await waitFor(() => expect(result.current.parsing).toBe(true))

    await act(async () => release(new ArrayBuffer(0)))
    expect(result.current.parsing).toBe(false)
  })

  describe('the drop zone', () => {
    const dragEvent = (files: File[] = []) =>
      ({
        preventDefault: vi.fn(),
        dataTransfer: { files },
      }) as unknown as React.DragEvent

    it('highlights while a file is over it', () => {
      const { result } = render()

      act(() => result.current.dropZone.onDragEnter(dragEvent()))

      expect(result.current.isDragging).toBe(true)
    })

    // dragenter/dragleave fire for every child the pointer crosses, so the
    // highlight is driven by nesting depth rather than the last event seen.
    it('stays highlighted while the pointer crosses inner elements', () => {
      const { result } = render()

      act(() => result.current.dropZone.onDragEnter(dragEvent()))
      act(() => result.current.dropZone.onDragEnter(dragEvent()))
      act(() => result.current.dropZone.onDragLeave(dragEvent()))

      expect(result.current.isDragging).toBe(true)
    })

    it('unhighlights once the pointer has left every level', () => {
      const { result } = render()
      act(() => result.current.dropZone.onDragEnter(dragEvent()))
      act(() => result.current.dropZone.onDragEnter(dragEvent()))

      act(() => result.current.dropZone.onDragLeave(dragEvent()))
      act(() => result.current.dropZone.onDragLeave(dragEvent()))

      expect(result.current.isDragging).toBe(false)
    })

    it('never counts below zero', () => {
      const { result } = render()

      act(() => result.current.dropZone.onDragLeave(dragEvent()))
      act(() => result.current.dropZone.onDragEnter(dragEvent()))
      act(() => result.current.dropZone.onDragLeave(dragEvent()))

      expect(result.current.isDragging).toBe(false)
    })

    it('parses the dropped file', async () => {
      const { result } = render()

      await act(async () =>
        result.current.dropZone.onDrop(
          dragEvent([xlsxFile([['level_id'], ['128']])])
        )
      )

      await waitFor(() => expect(handleParsed).toHaveBeenCalled())
      expect(result.current.isDragging).toBe(false)
    })

    it('ignores a drop carrying no file', async () => {
      const { result } = render()

      await act(async () => result.current.dropZone.onDrop(dragEvent()))

      expect(handleParsed).not.toHaveBeenCalled()
    })

    // Without preventDefault the browser navigates to the dropped file,
    // discarding the whole app session.
    it.each(['onDragEnter', 'onDragOver', 'onDragLeave', 'onDrop'] as const)(
      'prevents the browser default on %s',
      (handler) => {
        const { result } = render()
        const e = dragEvent()

        act(() => result.current.dropZone[handler](e))

        expect(e.preventDefault).toHaveBeenCalled()
      }
    )
  })
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
        ...emptyFlags,
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
        ...emptyFlags,
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
        ...emptyFlags,
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
