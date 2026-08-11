import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import * as XLSX from 'xlsx'
import type { AllFlags } from '../../importWizardModel'
import type { ParseResult } from '../../parseSpreadsheet'
import { importFlowStub } from '../../tests/fixtures'

// The hook reads everything through the flow context; stubbing that one
// module is enough to drive it.
vi.mock('../../ImportFlowProvider', () => ({ useImportFlow: vi.fn() }))

const { useImportFlow } = await import('../../ImportFlowProvider')
const { useUploadStep } = await import('../useUploadStep')

let flow: Record<string, unknown>
// Declared apart from `flow` so it keeps its Mock type for the call-argument
// assertions below.
let handleParsed: Mock<(result: ParseResult, flags: AllFlags) => void>

beforeEach(() => {
  handleParsed = vi.fn()
  flow = importFlowStub({ handleParsed })
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
