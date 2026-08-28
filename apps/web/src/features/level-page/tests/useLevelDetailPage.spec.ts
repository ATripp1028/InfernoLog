import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FabAction } from '@/context/FabActionsContext'
import type { MeData } from '@/lib/api/me'
import {
  apiError,
  queryWrapper,
  stubMutation,
  stubQuery,
} from '@/utils/testUtils'
import type { LevelPageData } from '@/lib/api/levelPage'
import { levelPageData, progressUpdate, runsGraphEntry } from './fixtures'

const LEVEL_ID = '128'

const { navigate, back, openForEdit } = vi.hoisted(() => ({
  navigate: vi.fn(),
  back: { href: '/log', replace: false, isOrigin: false, onClick: vi.fn() },
  openForEdit: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ levelId: LEVEL_ID }),
}))
vi.mock('@/lib/useGoBack', () => ({ useGoBack: vi.fn(() => back) }))
vi.mock('@/context/FabActionsContext', () => ({ useFabActions: vi.fn() }))
vi.mock('@/context/LoggingFlowContext', () => ({
  useLoggingFlow: () => ({ openForEdit }),
}))
vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/api/me', () => ({ useMe: vi.fn() }))
vi.mock('@/lib/api/levelPage', () => ({
  useLevelPage: vi.fn(),
  useDeleteProgressUpdate: vi.fn(),
}))
vi.mock('@/lib/api/log', () => ({ useDeleteProgress: vi.fn() }))
vi.mock('@/lib/api/logging', () => ({ useSubmitGddlRecord: vi.fn() }))

const { toast } = await import('@/components/generic/sonner')
const { useFabActions } = await import('@/context/FabActionsContext')
const { useMe } = await import('@/lib/api/me')
const { useLevelPage, useDeleteProgressUpdate } =
  await import('@/lib/api/levelPage')
const { useDeleteProgress } = await import('@/lib/api/log')
const { useSubmitGddlRecord } = await import('@/lib/api/logging')
const { useLevelDetailPage } = await import('../useLevelDetailPage')

let deleteLevel: ReturnType<typeof vi.fn>
let deleteEntry: ReturnType<typeof vi.fn>
let submitGddl: ReturnType<typeof vi.fn>

const meData = (hasGddlApiKey = false) => ({ hasGddlApiKey }) as MeData

beforeEach(() => {
  deleteLevel = vi.fn()
  deleteEntry = vi.fn()
  submitGddl = vi.fn()
  vi.mocked(useDeleteProgress).mockReturnValue(
    stubMutation({ mutate: deleteLevel })
  )
  vi.mocked(useDeleteProgressUpdate).mockReturnValue(
    stubMutation({ mutate: deleteEntry })
  )
  vi.mocked(useSubmitGddlRecord).mockReturnValue(
    stubMutation({ mutate: submitGddl })
  )
  vi.mocked(useMe).mockReturnValue(stubQuery<MeData>({ data: meData() }))
  vi.mocked(useLevelPage).mockReturnValue(
    stubQuery<LevelPageData>({ data: levelPageData() })
  )
})

/** Points the level query at a payload. */
function resolvesTo(overrides: Partial<LevelPageData> = {}) {
  vi.mocked(useLevelPage).mockReturnValue(
    stubQuery<LevelPageData>({ data: levelPageData(overrides) })
  )
}

function failsWith(error: unknown, isPending = false) {
  vi.mocked(useLevelPage).mockReturnValue(
    stubQuery<LevelPageData>({ error, isPending })
  )
}

function render() {
  const { wrapper } = queryWrapper()
  return renderHook(() => useLevelDetailPage(), { wrapper })
}

/** The action set the page last registered with the FAB. */
const registeredFab = (): FabAction[] | null => {
  const calls = vi.mocked(useFabActions).mock.calls
  return calls[calls.length - 1]?.[0] ?? null
}
const fabAction = (key: string) => registeredFab()?.find((a) => a.key === key)

describe('useLevelDetailPage', () => {
  describe('the page status', () => {
    it('is ready for a resolved level', () => {
      const { result } = render()

      expect(result.current.status).toBe('ready')
    })

    it.each([
      ['the level query is in flight', () => failsWith(null, true)],
      [
        'the viewer is still loading',
        () =>
          vi
            .mocked(useMe)
            .mockReturnValue(stubQuery<MeData>({ isPending: true })),
      ],
    ])('is loading while %s', (_label, setup) => {
      setup()

      expect(render().result.current.status).toBe('loading')
    })

    // 403 and 404 are meaningful states with their own copy, not failures —
    // and they must not be held behind the loading branch.
    it.each([
      ['a 403', apiError(403, 'Private'), 'private'],
      ['a 404', apiError(404, 'Not found'), 'not-found'],
      ['a 500', apiError(500, 'Server error'), 'error'],
      ['a network failure', new Error('offline'), 'error'],
    ])('reports %s as %s', (_label, error, status) => {
      failsWith(error)

      expect(render().result.current.status).toBe(status)
    })

    it('resolves a 403 even while the query still reports pending', () => {
      failsWith(apiError(403, 'Private'), true)

      expect(render().result.current.status).toBe('private')
    })

    // A refetch that fails while cached data is still on screen should keep
    // rendering the page rather than blanking it.
    it('stays ready when a failure arrives alongside existing data', () => {
      vi.mocked(useLevelPage).mockReturnValue(
        stubQuery<LevelPageData>({
          data: levelPageData(),
          error: new Error('refetch failed'),
        })
      )

      expect(render().result.current.status).toBe('ready')
    })
  })

  describe('derived values', () => {
    it('names the level, falling back to its id', () => {
      resolvesTo({ level: { ...levelPageData().level, name: 'Bloodbath' } })
      expect(render().result.current.levelName).toBe('Bloodbath')

      resolvesTo({ level: { ...levelPageData().level, name: null } })
      expect(render().result.current.levelName).toBe(`Level #${LEVEL_ID}`)
    })

    // levelProgressId is what distinguishes "my page for this level" from
    // someone else's public one.
    it('treats a payload carrying a progress id as owned', () => {
      expect(render().result.current.isOwner).toBe(true)
    })

    it('treats a payload with no progress id as not owned', () => {
      vi.mocked(useLevelPage).mockReturnValue(
        stubQuery<LevelPageData>({
          data: levelPageData({ levelProgressId: null as never }),
        })
      )

      expect(render().result.current.isOwner).toBe(false)
    })

    it('reports whether the level has a completion video', () => {
      resolvesTo({ completionVideoUrl: 'https://youtu.be/x' })

      expect(render().result.current.hasVideo).toBe(true)
    })

    it('reports whether the level has any runs to graph', () => {
      resolvesTo({ runsGraph: [runsGraphEntry()] })

      expect(render().result.current.hasGraph).toBe(true)
    })

    it('counts the logged entries', () => {
      resolvesTo({ progressUpdates: [progressUpdate(), progressUpdate()] })

      expect(render().result.current.totalEntries).toBe(2)
    })

    it('reports nothing for a level that has not loaded', () => {
      failsWith(null, true)
      const { result } = render()

      expect(result.current.hasVideo).toBe(false)
      expect(result.current.hasGraph).toBe(false)
      expect(result.current.totalEntries).toBe(0)
    })

    it('falls back to the list for the back affordance', () => {
      expect(render().result.current.back).toBe(back)
    })
  })

  describe('the level-scoped FAB', () => {
    it('registers no override for a level the viewer does not own', () => {
      vi.mocked(useLevelPage).mockReturnValue(
        stubQuery<LevelPageData>({
          data: levelPageData({ levelProgressId: null as never }),
        })
      )

      render()

      expect(registeredFab()).toBeNull()
    })

    it('offers the logging actions on an unbeaten level', () => {
      render()

      expect(registeredFab()?.map((a) => a.key)).toEqual([
        'edit',
        'log-completion',
        'log-progress',
        'log-drop',
        'add-collection',
        'delete',
      ])
    })

    // A level holds at most one completion, so once it is beaten there is
    // nothing new left to log.
    it('drops the logging actions once the level is beaten', () => {
      resolvesTo({
        progressUpdates: [progressUpdate({ kind: 'COMPLETION' })],
      })

      render()

      expect(registeredFab()?.map((a) => a.key)).toEqual([
        'edit',
        'add-collection',
        'delete',
      ])
    })

    it('flags only delete as dangerous', () => {
      render()

      expect(
        registeredFab()
          ?.filter((a) => a.danger)
          .map((a) => a.key)
      ).toEqual(['delete'])
    })

    it.each([
      ['log-completion', 'completion'],
      ['log-progress', 'progress'],
      ['log-drop', 'drop'],
    ])('opens the logging flow from %s', (key, kind) => {
      render()

      act(() => fabAction(key)!.onClick())

      expect(openForEdit).toHaveBeenCalledWith(LEVEL_ID, kind)
    })

    describe('the GDDL submission action', () => {
      const gddlSetup = (opts: { key: boolean; completion: boolean }) => {
        vi.mocked(useMe).mockReturnValue(
          stubQuery<MeData>({ data: meData(opts.key) })
        )
        resolvesTo({
          progressUpdates: opts.completion
            ? [progressUpdate({ kind: 'COMPLETION' })]
            : [],
        })
        render()
      }

      it('appears for an owner with a key and a completion', () => {
        gddlSetup({ key: true, completion: true })

        expect(fabAction('gddl-submit')).toBeDefined()
      })

      // Nothing to submit without a completion, and nowhere to submit it
      // without a key.
      it.each([
        ['no API key', { key: false, completion: true }],
        ['no completion', { key: true, completion: false }],
        ['neither', { key: false, completion: false }],
      ])('is hidden with %s', (_label, opts) => {
        gddlSetup(opts)

        expect(fabAction('gddl-submit')).toBeUndefined()
      })
    })

    describe('"Edit this entry"', () => {
      // The FAB is not scoped to a Timeline card, so it resolves the primary
      // entry itself — completion first, else the newest.
      it('opens the completion when there is one', () => {
        resolvesTo({
          progressUpdates: [
            progressUpdate({ progressUpdateId: 'newest' }),
            progressUpdate({
              progressUpdateId: 'the-completion',
              kind: 'COMPLETION',
            }),
          ],
        })
        const { result } = render()

        act(() => fabAction('edit')!.onClick())

        expect(result.current.editRunProgressUpdateId).toBe('the-completion')
        expect(result.current.editRunOpen).toBe(true)
      })

      it('opens the newest entry when there is no completion', () => {
        resolvesTo({
          progressUpdates: [
            progressUpdate({ progressUpdateId: 'newest' }),
            progressUpdate({ progressUpdateId: 'older' }),
          ],
        })
        const { result } = render()

        act(() => fabAction('edit')!.onClick())

        expect(result.current.editRunProgressUpdateId).toBe('newest')
      })

      it('opens nothing for a level with no entries', () => {
        const { result } = render()

        act(() => fabAction('edit')!.onClick())

        expect(result.current.editRunOpen).toBe(false)
      })
    })
  })

  describe('modal state', () => {
    it('starts with every modal closed', () => {
      const { result } = render()

      expect(result.current.editRunOpen).toBe(false)
      expect(result.current.editLevelOpen).toBe(false)
      expect(result.current.addToCollectionOpen).toBe(false)
      expect(result.current.pendingDelete).toBe(false)
      expect(result.current.pendingDeleteUpdateId).toBeNull()
      expect(result.current.pendingGddlSubmit).toBe(false)
    })

    it('opens the run editor on a specific entry', () => {
      const { result } = render()

      act(() => result.current.openEditRun('update-7'))

      expect(result.current.editRunOpen).toBe(true)
      expect(result.current.editRunProgressUpdateId).toBe('update-7')
    })

    // Clearing the id as well as the flag matters: a stale id would make the
    // next open flash the previous entry before the new one is set.
    it('forgets which entry it was editing on close', () => {
      const { result } = render()
      act(() => result.current.openEditRun('update-7'))

      act(() => result.current.closeEditRun())

      expect(result.current.editRunOpen).toBe(false)
      expect(result.current.editRunProgressUpdateId).toBeNull()
    })

    it('opens and closes the level-details editor', () => {
      const { result } = render()

      act(() => result.current.openEditLevel())
      expect(result.current.editLevelOpen).toBe(true)

      act(() => result.current.closeEditLevel())
      expect(result.current.editLevelOpen).toBe(false)
    })

    it('opens the collection picker from the FAB', () => {
      const { result } = render()

      act(() => fabAction('add-collection')!.onClick())

      expect(result.current.addToCollectionOpen).toBe(true)
    })

    it.each([
      ['delete', 'pendingDelete'],
      ['gddl-submit', 'pendingGddlSubmit'],
    ] as const)('arms the %s confirmation from the FAB', (key, flag) => {
      vi.mocked(useMe).mockReturnValue(
        stubQuery<MeData>({ data: meData(true) })
      )
      resolvesTo({ progressUpdates: [progressUpdate({ kind: 'COMPLETION' })] })
      const { result } = render()

      act(() => fabAction(key)!.onClick())

      expect(result.current[flag]).toBe(true)
    })
  })

  describe('deleting the level', () => {
    it('deletes and returns to the list', () => {
      const { result } = render()

      act(() => result.current.handleDeleteConfirm())
      const { onSuccess } = deleteLevel.mock.calls[0]![1]
      act(() => onSuccess())

      expect(deleteLevel).toHaveBeenCalledWith(LEVEL_ID, expect.anything())
      expect(toast.success).toHaveBeenCalledWith('Level deleted')
      expect(navigate).toHaveBeenCalledWith({ to: '/log' })
      expect(result.current.pendingDelete).toBe(false)
    })

    it('reports a failure without navigating away', () => {
      const { result } = render()

      act(() => result.current.handleDeleteConfirm())
      const { onError } = deleteLevel.mock.calls[0]![1]
      act(() => onError())

      expect(toast.error).toHaveBeenCalledWith('Failed to delete level')
      expect(navigate).not.toHaveBeenCalled()
    })
  })

  describe('deleting one timeline entry', () => {
    it('does nothing until an entry is armed', () => {
      const { result } = render()

      act(() => result.current.handleDeleteEntryConfirm())

      expect(deleteEntry).not.toHaveBeenCalled()
    })

    it('deletes the armed entry and stays on the page', () => {
      const { result } = render()
      act(() => result.current.setPendingDeleteUpdateId('update-7'))

      act(() => result.current.handleDeleteEntryConfirm())
      const { onSuccess } = deleteEntry.mock.calls[0]![1]
      act(() => onSuccess({ deletedLevelProgress: false }))

      expect(deleteEntry).toHaveBeenCalledWith('update-7', expect.anything())
      expect(toast.success).toHaveBeenCalledWith('Entry deleted')
      expect(result.current.pendingDeleteUpdateId).toBeNull()
      expect(navigate).not.toHaveBeenCalled()
    })

    // Deleting the last entry removes the LevelProgress with it, so there is
    // no page left to return to.
    it('leaves for the list when the last entry took the level with it', () => {
      const { result } = render()
      act(() => result.current.setPendingDeleteUpdateId('update-7'))

      act(() => result.current.handleDeleteEntryConfirm())
      const { onSuccess } = deleteEntry.mock.calls[0]![1]
      act(() => onSuccess({ deletedLevelProgress: true }))

      expect(navigate).toHaveBeenCalledWith({ to: '/log' })
    })

    it('reports a failure and keeps the entry armed', () => {
      const { result } = render()
      act(() => result.current.setPendingDeleteUpdateId('update-7'))

      act(() => result.current.handleDeleteEntryConfirm())
      const { onError } = deleteEntry.mock.calls[0]![1]
      act(() => onError())

      expect(toast.error).toHaveBeenCalledWith('Failed to delete entry')
      expect(result.current.pendingDeleteUpdateId).toBe('update-7')
    })
  })

  describe('submitting to GDDL', () => {
    it('submits the level and closes the confirmation', () => {
      const { result } = render()
      act(() => result.current.setPendingGddlSubmit(true))

      act(() => result.current.handleGddlSubmitConfirm())
      const { onSuccess } = submitGddl.mock.calls[0]![1]
      act(() => onSuccess())

      expect(submitGddl).toHaveBeenCalledWith(LEVEL_ID, expect.anything())
      expect(toast.success).toHaveBeenCalledWith('Submitted to GDDL')
      expect(result.current.pendingGddlSubmit).toBe(false)
    })

    it('reports a failure and leaves the confirmation open', () => {
      const { result } = render()
      act(() => result.current.setPendingGddlSubmit(true))

      act(() => result.current.handleGddlSubmitConfirm())
      const { onError } = submitGddl.mock.calls[0]![1]
      act(() => onError())

      expect(toast.error).toHaveBeenCalledWith('Failed to submit to GDDL')
      expect(result.current.pendingGddlSubmit).toBe(true)
    })
  })
})
