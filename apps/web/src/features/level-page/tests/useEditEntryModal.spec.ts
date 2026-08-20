import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { MeData } from '@/lib/api/me'
import { stubMutation, stubQuery } from '@/utils/testUtils'
import type { LevelPageData, ProgressUpdate } from '../types'
import { levelPageData, progressUpdate } from './fixtures'

vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/api/me', () => ({ useMe: vi.fn() }))
vi.mock('@/lib/api/levelPage', () => ({ useEditProgress: vi.fn() }))
vi.mock('@/lib/api/logging', () => ({ useResolveLevel: vi.fn() }))
vi.mock('@/lib/timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/timezone')>()),
  getViewerTimezone: () => 'UTC',
}))

const { toast } = await import('@/components/generic/sonner')
const { useMe } = await import('@/lib/api/me')
const { useEditProgress } = await import('@/lib/api/levelPage')
const { useResolveLevel } = await import('@/lib/api/logging')
const { useEditEntryModal } = await import('../useEditEntryModal')

const meData = (overrides: Partial<MeData> = {}) =>
  ({
    ratingMode: 'SIMPLE',
    ratingCategories: [],
    showHighlightUrl: false,
    ...overrides,
  }) as MeData

let editMutate: ReturnType<typeof vi.fn>
let onClose: Mock<() => void>

/** The PATCH body of the one save, and the callbacks it was given. */
const saved = () => editMutate.mock.calls[0]![0] as Record<string, unknown>
const handlers = () =>
  editMutate.mock.calls[0]![1] as {
    onSuccess: () => void
    onError: () => void
  }

beforeEach(() => {
  editMutate = vi.fn()
  onClose = vi.fn<() => void>()
  vi.mocked(useEditProgress).mockReturnValue(
    stubMutation({ mutate: editMutate })
  )
  vi.mocked(useResolveLevel).mockReturnValue(stubMutation({ mutate: vi.fn() }))
  vi.mocked(useMe).mockReturnValue(stubQuery<MeData>({ data: meData() }))
})

function render(
  opts: { updates?: ProgressUpdate[]; data?: Partial<LevelPageData> } = {}
) {
  const updates = opts.updates ?? [
    progressUpdate({ progressUpdateId: 'u1', kind: 'COMPLETION' }),
  ]
  const data = levelPageData({
    status: 'COMPLETED',
    progressUpdates: updates,
    ...opts.data,
  })
  return renderHook(
    ({ open }: { open: boolean }) =>
      useEditEntryModal({
        open,
        onClose,
        data,
        levelId: '128',
        scale: 'ZERO_TO_HUNDRED',
        datePref: 'ISO',
      }),
    { initialProps: { open: true } }
  )
}

describe('useEditEntryModal', () => {
  describe('tabs', () => {
    it('opens on the run half, which holds the fields that change most', () => {
      expect(render().result.current.tab).toBe('run')
    })

    // The run half has nothing to target without an entry — an app-created
    // level always has one, but the modal must not open onto an empty panel.
    it('falls back to the level half when there is no logged entry', () => {
      const { result } = render({ updates: [] })

      expect(result.current.hasRun).toBe(false)
      expect(result.current.tab).toBe('level')
    })

    it('returns to the run half on reopen, not wherever it was left', () => {
      const { result, rerender } = render()
      act(() => result.current.setTab('level'))

      rerender({ open: false })
      rerender({ open: true })

      expect(result.current.tab).toBe('run')
    })
  })

  describe('saving', () => {
    // The point of merging: PATCH takes both rows' fields in one flat body,
    // so a single request can never leave one half saved and the other not.
    it('sends both halves in one request', () => {
      const { result } = render()
      act(() => result.current.level.patch({ levelNotes: 'overall' }))
      act(() => result.current.run.patch({ notes: 'this run' }))

      act(() => result.current.handleSave())

      expect(editMutate).toHaveBeenCalledTimes(1)
      expect(saved()).toMatchObject({
        progressUpdateId: 'u1',
        levelNotes: 'overall',
        notes: 'this run',
      })
    })

    it('saves edits made on the tab that is not on screen', () => {
      const { result } = render()
      act(() => result.current.run.patch({ notes: 'typed on the run tab' }))
      act(() => result.current.setTab('level'))

      act(() => result.current.handleSave())

      expect(saved()).toMatchObject({ notes: 'typed on the run tab' })
    })

    it('omits the run half when there is no entry to target', () => {
      const { result } = render({
        updates: [],
        data: { status: 'IN_PROGRESS' },
      })

      act(() => result.current.handleSave())

      expect(saved()).not.toHaveProperty('progressUpdateId')
    })

    it('closes and confirms once the write lands', () => {
      const { result } = render()
      act(() => result.current.handleSave())

      act(() => handlers().onSuccess())

      expect(toast.success).toHaveBeenCalledWith('Changes saved')
      expect(onClose).toHaveBeenCalled()
    })

    it('reports a failed write and stays open', () => {
      const { result } = render()
      act(() => result.current.handleSave())

      act(() => handlers().onError())

      expect(toast.error).toHaveBeenCalledWith('Failed to save changes')
      expect(onClose).not.toHaveBeenCalled()
    })

    // A DST-skipped time has no instant to store, and the failure can't be
    // seen on a panel that isn't on screen — so saving switches to the
    // offending half instead of silently doing nothing.
    it('switches to the half whose date is unusable rather than saving', () => {
      const { result } = render()
      act(() => result.current.setTab('level'))
      act(() =>
        result.current.level.patch({
          worstFailSameDay: false,
          worstFailDate: '2026-03-08',
          worstFailTime: '02:30',
          worstFailTimezone: 'America/New_York',
        })
      )
      act(() => result.current.setTab('run'))

      act(() => result.current.handleSave())

      expect(editMutate).not.toHaveBeenCalled()
      expect(result.current.tab).toBe('level')
    })
  })

  describe('validation', () => {
    it('blocks the save while either half has an invalid field', () => {
      const { result } = render()

      act(() => result.current.run.patch({ attempts: '99999999999' }))

      expect(result.current.runError).toBe(true)
      expect(result.current.hasFieldError).toBe(true)
    })

    it('flags the level half on its own', () => {
      const { result } = render()

      act(() => result.current.level.patch({ userGddlTier: '99999' }))

      expect(result.current.levelError).toBe(true)
      expect(result.current.runError).toBe(false)
    })
  })
})
