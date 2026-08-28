import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { MeData } from '@/lib/api/me'
import { stubMutation, stubQuery } from '@/utils/testUtils'
import type { LevelPageData, ProgressUpdate } from '@/lib/api/levelPage'
import { levelMeta, levelPageData, progressUpdate } from './fixtures'

vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/api/me', () => ({ useMe: vi.fn() }))
vi.mock('@/lib/api/levelPage', () => ({ useEditProgress: vi.fn() }))
vi.mock('@/lib/timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/timezone')>()),
  getViewerTimezone: () => 'UTC',
}))

const { toast } = await import('@/components/generic/sonner')
const { useMe } = await import('@/lib/api/me')
const { useEditProgress } = await import('@/lib/api/levelPage')
const { useEditRunModal } = await import('../useEditRunModal')

const meData = (overrides: Partial<MeData> = {}) =>
  ({ showHighlightUrl: false, ...overrides }) as MeData

let editMutate: ReturnType<typeof vi.fn>
let onClose: Mock<() => void>

beforeEach(() => {
  editMutate = vi.fn()
  onClose = vi.fn<() => void>()
  vi.mocked(useEditProgress).mockReturnValue(
    stubMutation({ mutate: editMutate })
  )
  vi.mocked(useMe).mockReturnValue(stubQuery<MeData>({ data: meData() }))
})

/** Renders the modal against a level holding exactly `updates`. */
function render(
  opts: {
    updates?: ProgressUpdate[]
    target?: string | null
    data?: Partial<LevelPageData>
    scale?: 'ZERO_TO_TEN' | 'ZERO_TO_HUNDRED'
    open?: boolean
  } = {}
) {
  const updates = opts.updates ?? [
    progressUpdate({ progressUpdateId: 'u1', kind: 'PROGRESS' }),
  ]
  const data = levelPageData({ progressUpdates: updates, ...opts.data })
  const view = renderHook(
    ({ open, target }: { open: boolean; target: string | null }) =>
      useEditRunModal({
        open,
        onClose,
        data,
        levelId: '128',
        scale: opts.scale ?? 'ZERO_TO_HUNDRED',
        datePref: 'ISO',
        progressUpdateId: target,
      }),
    {
      initialProps: {
        open: opts.open ?? true,
        target:
          opts.target === undefined
            ? (updates[0]?.progressUpdateId ?? null)
            : opts.target,
      },
    }
  )
  return view
}

const saved = () => editMutate.mock.calls[0]![0] as Record<string, unknown>

describe('useEditRunModal', () => {
  describe('readiness', () => {
    it('is ready once the target entry and the settings are both present', () => {
      expect(render().result.current.ready).toBe(true)
    })

    it('is not ready with no entry selected', () => {
      expect(render({ target: null }).result.current.ready).toBe(false)
    })

    it('is not ready when the selected entry is not on this level', () => {
      expect(render({ target: 'nope' }).result.current.ready).toBe(false)
    })

    it('is not ready before the settings load', () => {
      vi.mocked(useMe).mockReturnValue(stubQuery<MeData>({ data: undefined }))

      expect(render().result.current.ready).toBe(false)
    })
  })

  describe('seeding the form', () => {
    it('reads the entry fields off the update', () => {
      const { result } = render({
        updates: [
          progressUpdate({
            progressUpdateId: 'u1',
            attempts: 4200,
            fps: 240,
            onStream: true,
            notes: 'gg',
            dateUncertain: true,
            device: 'pc',
          }),
        ],
      })

      expect(result.current.form).toMatchObject({
        attempts: '4200',
        fps: '240',
        onStream: true,
        notes: 'gg',
        dateUncertain: true,
        device: 'pc',
      })
    })

    it('blanks the fields that were never set', () => {
      const { result } = render({
        updates: [
          progressUpdate({
            progressUpdateId: 'u1',
            attempts: null,
            fps: null,
            notes: null,
            videoUrl: null,
          }),
        ],
      })

      expect(result.current.form.attempts).toBe('')
      expect(result.current.form.fps).toBe('')
      expect(result.current.form.notes).toBe('')
      expect(result.current.form.videoUrl).toBe('')
    })

    it('converts the stored enjoyment into display units', () => {
      const { result } = render({
        updates: [progressUpdate({ progressUpdateId: 'u1', enjoyment: 80 })],
        scale: 'ZERO_TO_TEN',
      })

      expect(result.current.form.enjoyment).toBe(8)
    })

    // 2.2 is the current basis, so an entry that never pinned one edits as 2.2.
    it('defaults an unversioned entry to 2.2', () => {
      const { result } = render({
        updates: [
          progressUpdate({ progressUpdateId: 'u1', percentageVersion: null }),
        ],
      })

      expect(result.current.form.percentageVersion).toBe('TWO_TWO')
    })

    it('defaults the zone to the viewer’s when the entry has none', () => {
      const { result } = render({
        updates: [
          progressUpdate({ progressUpdateId: 'u1', dateTimezone: null }),
        ],
      })

      expect(result.current.form.timezone).toBe('UTC')
    })

    it('seeds the run from a stored range', () => {
      const { result } = render({
        updates: [
          progressUpdate({
            progressUpdateId: 'u1',
            percentage: null,
            runFrom: 30,
            runTo: 75,
          }),
        ],
      })

      expect(result.current.parsedRun).toEqual({ from: 30, to: 75 })
    })

    it('seeds the run from a bare percentage as starting at zero', () => {
      const { result } = render({
        updates: [
          progressUpdate({
            progressUpdateId: 'u1',
            percentage: 42,
            runFrom: null,
            runTo: null,
          }),
        ],
      })

      expect(result.current.parsedRun).toEqual({ from: 0, to: 42 })
    })

    // A cancel-then-reopen must never show the previous session's edits.
    it('re-seeds when the modal reopens', () => {
      const { result, rerender } = render({
        updates: [progressUpdate({ progressUpdateId: 'u1', notes: 'stored' })],
      })
      act(() => result.current.patch({ notes: 'mid-edit' }))

      rerender({ open: false, target: 'u1' })
      rerender({ open: true, target: 'u1' })

      expect(result.current.form.notes).toBe('stored')
    })

    it('re-seeds when a different entry is targeted while open', () => {
      const { result, rerender } = render({
        updates: [
          progressUpdate({ progressUpdateId: 'u1', notes: 'first' }),
          progressUpdate({ progressUpdateId: 'u2', notes: 'second' }),
        ],
      })

      rerender({ open: true, target: 'u2' })

      expect(result.current.form.notes).toBe('second')
    })
  })

  describe('which fields the entry kind shows', () => {
    it.each([
      ['COMPLETION', 'isCompletion'],
      ['DROP', 'isDrop'],
      ['PROGRESS', 'isProgress'],
    ] as const)('classifies a %s entry', (kind, flag) => {
      const { result } = render({
        updates: [progressUpdate({ progressUpdateId: 'u1', kind })],
      })

      expect(result.current[flag]).toBe(true)
    })

    it('follows the user’s highlight-url preference', () => {
      vi.mocked(useMe).mockReturnValue(
        stubQuery<MeData>({ data: meData({ showHighlightUrl: true }) })
      )

      expect(render().result.current.showHighlightUrl).toBe(true)
    })

    describe('the percentage-basis picker', () => {
      it('appears on a classic level', () => {
        expect(render().result.current.showVersionPicker).toBe(true)
      })

      it('is hidden on a platformer, which has no percentage basis', () => {
        const { result } = render({
          data: { level: levelMeta({ levelType: 'PLATFORMER' }) },
        })

        expect(result.current.showVersionPicker).toBe(false)
      })

      // A completion dated before 2.2 already pins the basis, so there is
      // nothing left to pick.
      it('is hidden once a pre-2.2 completion pins the basis', () => {
        const { result } = render({
          updates: [
            progressUpdate({ progressUpdateId: 'u1', kind: 'PROGRESS' }),
            progressUpdate({
              progressUpdateId: 'u2',
              kind: 'COMPLETION',
              date: '2023-01-01',
            }),
          ],
          target: 'u1',
        })

        expect(result.current.showVersionPicker).toBe(false)
      })

      it('stays visible for a post-2.2 completion', () => {
        const { result } = render({
          updates: [
            progressUpdate({ progressUpdateId: 'u1', kind: 'PROGRESS' }),
            progressUpdate({
              progressUpdateId: 'u2',
              kind: 'COMPLETION',
              date: '2026-01-01',
            }),
          ],
          target: 'u1',
        })

        expect(result.current.showVersionPicker).toBe(true)
      })
    })
  })

  describe('validation', () => {
    it('rejects an attempts count over the bound', () => {
      const { result } = render()
      act(() => result.current.patch({ attempts: '99999999999' }))

      expect(result.current.attemptsError).not.toBeNull()
      expect(result.current.hasFieldError).toBe(true)
    })

    it('rejects an fps over the bound', () => {
      const { result } = render()
      act(() => result.current.patch({ fps: '9999999' }))

      expect(result.current.fpsError).not.toBeNull()
      expect(result.current.hasFieldError).toBe(true)
    })

    // A progress entry with no run is meaningless — that is the whole record.
    it('requires a run on a progress entry', () => {
      const { result } = render()
      act(() => result.current.setParsedRun(null))

      expect(result.current.runInputMissing).toBe(true)
      expect(result.current.hasFieldError).toBe(true)
    })

    it.each(['COMPLETION', 'DROP'] as const)(
      'requires no run on a %s entry',
      (kind) => {
        const { result } = render({
          updates: [progressUpdate({ progressUpdateId: 'u1', kind })],
        })
        act(() => result.current.setParsedRun(null))

        expect(result.current.runInputMissing).toBe(false)
        expect(result.current.hasFieldError).toBe(false)
      }
    )

    it('reports no error for a valid form', () => {
      expect(render().result.current.hasFieldError).toBe(false)
    })
  })

  describe('the entry label', () => {
    it.each([
      ['COMPLETION', 'your completion'],
      ['DROP', 'your drop'],
    ] as const)('names a %s without a date', (kind, expected) => {
      const { result } = render({
        updates: [progressUpdate({ progressUpdateId: 'u1', kind })],
      })

      expect(result.current.entryLabel).toBe(expected)
    })

    // Progress entries repeat, so only they need a date to tell them apart.
    it('dates a progress entry', () => {
      const { result } = render({
        updates: [
          progressUpdate({ progressUpdateId: 'u1', date: '2026-03-14' }),
        ],
      })

      expect(result.current.entryLabel).toBe('progress from 2026-03-14')
    })

    it('falls back to when a dateless entry was logged', () => {
      const { result } = render({
        updates: [
          progressUpdate({
            progressUpdateId: 'u1',
            date: null,
            loggedAt: '2026-06-01T12:00:00.000Z',
          }),
        ],
      })

      expect(result.current.entryLabel).toBe('progress from 2026-06-01')
    })

    it('is blank with no entry selected', () => {
      expect(render({ target: null }).result.current.entryLabel).toBe('')
    })
  })

  describe('saving', () => {
    it('sends the entry it is editing', () => {
      const { result } = render()

      act(() => result.current.handleSave())

      expect(saved().progressUpdateId).toBe('u1')
    })

    it('does nothing with no entry selected', () => {
      const { result } = render({ target: null })

      act(() => result.current.handleSave())

      expect(editMutate).not.toHaveBeenCalled()
    })

    it('sends the shared fields', () => {
      const { result } = render()
      act(() =>
        result.current.patch({
          attempts: '4200',
          fps: '240',
          onStream: true,
          notes: 'gg',
          device: 'mobile',
        })
      )

      act(() => result.current.handleSave())

      expect(saved()).toMatchObject({
        attempts: 4200,
        fps: 240,
        onStream: true,
        notes: 'gg',
        device: 'mobile',
      })
    })

    it('sends null for cleared fields', () => {
      const { result } = render()
      act(() => result.current.patch({ attempts: '', fps: '', notes: '' }))

      act(() => result.current.handleSave())

      expect(saved().attempts).toBeNull()
      expect(saved().fps).toBeNull()
      expect(saved().notes).toBeNull()
    })

    it('converts enjoyment back to internal units', () => {
      const { result } = render({ scale: 'ZERO_TO_TEN' })
      act(() => result.current.patch({ enjoyment: 8.5 }))

      act(() => result.current.handleSave())

      expect(saved().enjoyment).toBe(85)
    })

    it('abandons the save for a time daylight saving skipped', () => {
      const { result } = render()
      act(() =>
        result.current.patch({
          date: '2026-03-08',
          time: '02:30',
          timezone: 'America/New_York',
        })
      )

      act(() => result.current.handleSave())

      expect(editMutate).not.toHaveBeenCalled()
    })

    describe('the run', () => {
      // A run starting at zero is stored as a bare percentage; anything else
      // keeps both ends.
      it('sends a zero-based run as a percentage', () => {
        const { result } = render()
        act(() => result.current.setParsedRun({ from: 0, to: 61 }))

        act(() => result.current.handleSave())

        expect(saved().percentage).toBe(61)
        expect(saved().runFrom).toBeUndefined()
      })

      it('sends a mid-level run as a range', () => {
        const { result } = render()
        act(() => result.current.setParsedRun({ from: 30, to: 75 }))

        act(() => result.current.handleSave())

        expect(saved().runFrom).toBe(30)
        expect(saved().runTo).toBe(75)
        expect(saved().percentage).toBeUndefined()
      })

      it.each(['COMPLETION', 'DROP'] as const)(
        'sends no run for a %s entry',
        (kind) => {
          const { result } = render({
            updates: [progressUpdate({ progressUpdateId: 'u1', kind })],
          })
          act(() => result.current.setParsedRun({ from: 0, to: 61 }))

          act(() => result.current.handleSave())

          expect(saved().percentage).toBeUndefined()
          expect(saved().runFrom).toBeUndefined()
        }
      )
    })

    describe('completion-only fields', () => {
      const completion = (data?: Partial<LevelPageData>) =>
        render({
          updates: [
            progressUpdate({ progressUpdateId: 'u1', kind: 'COMPLETION' }),
          ],
          ...(data ? { data } : {}),
        })

      it('sends the opinion and the video links', () => {
        const { result } = completion()
        act(() =>
          result.current.patch({
            difficultyOpinion: 'EXTREME',
            videoUrl: 'https://youtu.be/x',
            highlightUrl: '',
          })
        )

        act(() => result.current.handleSave())

        expect(saved().difficultyOpinion).toBe('EXTREME')
        expect(saved().videoUrl).toBe('https://youtu.be/x')
        expect(saved().highlightUrl).toBeNull()
      })

      it('omits them for a progress entry', () => {
        const { result } = render()

        act(() => result.current.handleSave())

        expect(saved().difficultyOpinion).toBeUndefined()
        expect(saved().videoUrl).toBeUndefined()
      })

      describe('the two-player fields', () => {
        it('are omitted on a level that is not two-player', () => {
          const { result } = completion({
            level: levelMeta({ twoPlayer: false }),
          })

          act(() => result.current.handleSave())

          expect(saved().twoPlayerSolo).toBeUndefined()
        })

        it('record a solo clear with no partner', () => {
          const { result } = completion({
            level: levelMeta({ twoPlayer: true }),
          })
          act(() =>
            result.current.patch({
              twoPlayerSolo: true,
              twoPlayerPartner: 'someone',
            })
          )

          act(() => result.current.handleSave())

          expect(saved().twoPlayerSolo).toBe(true)
          expect(saved().twoPlayerPartner).toBeNull()
        })

        it('record the partner on a co-op clear', () => {
          const { result } = completion({
            level: levelMeta({ twoPlayer: true }),
          })
          act(() =>
            result.current.patch({
              twoPlayerSolo: false,
              twoPlayerPartner: 'someone',
            })
          )

          act(() => result.current.handleSave())

          expect(saved().twoPlayerSolo).toBe(false)
          expect(saved().twoPlayerPartner).toBe('someone')
        })

        it('send a null partner when the name was left blank', () => {
          const { result } = completion({
            level: levelMeta({ twoPlayer: true }),
          })
          act(() =>
            result.current.patch({
              twoPlayerSolo: false,
              twoPlayerPartner: '',
            })
          )

          act(() => result.current.handleSave())

          expect(saved().twoPlayerPartner).toBeNull()
        })
      })
    })

    it('confirms and closes on success', () => {
      const { result } = render()

      act(() => result.current.handleSave())
      const { onSuccess } = editMutate.mock.calls[0]![1]
      act(() => onSuccess())

      expect(toast.success).toHaveBeenCalledWith('Changes saved')
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('reports a failure and stays open', () => {
      const { result } = render()

      act(() => result.current.handleSave())
      const { onError } = editMutate.mock.calls[0]![1]
      act(() => onError())

      expect(toast.error).toHaveBeenCalledWith('Failed to save changes')
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
