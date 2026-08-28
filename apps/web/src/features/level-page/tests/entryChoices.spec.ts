import { describe, expect, it, vi } from 'vitest'
import type { ProgressUpdate } from '@/lib/api/levelPage'
import { levelPageData, progressUpdate } from './fixtures'

vi.mock('@/lib/timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/timezone')>()),
  getViewerTimezone: () => 'UTC',
}))

const { entryChoices, defaultEntryChoice } = await import('../entryChoices')

const ids = (...args: Parameters<typeof entryChoices>) =>
  entryChoices(...args).map((c) => c.id)

describe('entryChoices', () => {
  describe('ordering', () => {
    it('lists entries newest first', () => {
      const data = levelPageData({
        progressUpdates: [
          progressUpdate({ progressUpdateId: 'mid', date: '2026-02-10' }),
          progressUpdate({ progressUpdateId: 'old', date: '2026-01-05' }),
          progressUpdate({ progressUpdateId: 'new', date: '2026-03-20' }),
        ],
      })

      expect(ids(data, 'ISO')).toEqual(['new', 'mid', 'old'])
    })

    // The whole point of ordering on `date`: a run from years ago, typed in
    // today, belongs where it happened rather than at the top of the list.
    it('orders on when a run happened, not when it was logged', () => {
      const data = levelPageData({
        progressUpdates: [
          progressUpdate({
            progressUpdateId: 'logged-today',
            date: '2024-01-01',
            loggedAt: '2026-08-19T10:00:00.000Z',
          }),
          progressUpdate({
            progressUpdateId: 'happened-recently',
            date: '2026-07-01',
            loggedAt: '2026-07-01T10:00:00.000Z',
          }),
        ],
      })

      expect(ids(data, 'ISO')).toEqual(['happened-recently', 'logged-today'])
    })

    it('breaks a tie on the same day by which was logged last', () => {
      const data = levelPageData({
        progressUpdates: [
          progressUpdate({
            progressUpdateId: 'first',
            date: '2026-02-10',
            loggedAt: '2026-02-10T08:00:00.000Z',
          }),
          progressUpdate({
            progressUpdateId: 'second',
            date: '2026-02-10',
            loggedAt: '2026-02-10T20:00:00.000Z',
          }),
        ],
      })

      expect(ids(data, 'ISO')).toEqual(['second', 'first'])
    })

    // A dateless entry still has to sort somewhere — the timeline shows its
    // loggedAt in place of a date, so ordering uses the same substitution.
    it('falls back to loggedAt for an entry with no date', () => {
      const data = levelPageData({
        progressUpdates: [
          progressUpdate({ progressUpdateId: 'dated', date: '2026-01-01' }),
          progressUpdate({
            progressUpdateId: 'dateless',
            date: null,
            loggedAt: '2026-05-01T00:00:00.000Z',
          }),
        ],
      })

      expect(ids(data, 'ISO')).toEqual(['dateless', 'dated'])
    })

    it('has nothing to offer for a level with no entries', () => {
      expect(entryChoices(levelPageData(), 'ISO')).toEqual([])
    })

    it('leaves the source order untouched', () => {
      const updates = [
        progressUpdate({ progressUpdateId: 'a', date: '2026-01-01' }),
        progressUpdate({ progressUpdateId: 'b', date: '2026-06-01' }),
      ]
      entryChoices(levelPageData({ progressUpdates: updates }), 'ISO')

      expect(updates.map((u) => u.progressUpdateId)).toEqual(['a', 'b'])
    })
  })

  describe('defaultEntryChoice', () => {
    const choicesFor = (...updates: Partial<ProgressUpdate>[]) =>
      entryChoices(
        levelPageData({ progressUpdates: updates.map(progressUpdate) }),
        'ISO'
      )

    it('opens on the completion, which carries the fields unique to it', () => {
      const choices = choicesFor(
        { progressUpdateId: 'the-completion', kind: 'COMPLETION' },
        { progressUpdateId: 'a-run' }
      )

      expect(defaultEntryChoice(choices)?.id).toBe('the-completion')
    })

    // Ordering alone would hand the default to the progress run here, hiding
    // the video and difficulty-opinion fields behind the picker on exactly
    // the levels that have them.
    it('opens on the completion even when a run is dated after it', () => {
      const choices = choicesFor(
        {
          progressUpdateId: 'the-completion',
          kind: 'COMPLETION',
          date: '2026-01-05',
        },
        { progressUpdateId: 'later-run', date: '2026-06-30' }
      )

      expect(choices[0]!.id).toBe('later-run')
      expect(defaultEntryChoice(choices)?.id).toBe('the-completion')
    })

    it('falls back to the most recent entry on an unbeaten level', () => {
      const choices = choicesFor(
        { progressUpdateId: 'old', date: '2026-01-05' },
        { progressUpdateId: 'recent', date: '2026-06-30' }
      )

      expect(defaultEntryChoice(choices)?.id).toBe('recent')
    })

    it('opens on the drop when that is the most recent entry', () => {
      const choices = choicesFor(
        { progressUpdateId: 'a-run', date: '2026-01-05' },
        { progressUpdateId: 'the-drop', kind: 'DROP', date: '2026-06-30' }
      )

      expect(defaultEntryChoice(choices)?.id).toBe('the-drop')
    })

    it('has nothing to open on for a level with no entries', () => {
      expect(defaultEntryChoice([])).toBeNull()
    })
  })

  describe('labels', () => {
    const labelOf = (update: Parameters<typeof progressUpdate>[0]) =>
      entryChoices(
        levelPageData({ progressUpdates: [progressUpdate(update)] }),
        'ISO'
      )[0]!.label

    it('names a completion rather than its implied 100%', () => {
      expect(labelOf({ kind: 'COMPLETION', date: '2026-03-14' })).toBe(
        'Completion · 2026-03-14'
      )
    })

    it('names a drop, which tracks no percentage of its own', () => {
      expect(labelOf({ kind: 'DROP', date: '2026-03-14' })).toBe(
        'Drop · 2026-03-14'
      )
    })

    it('shows a progress entry’s percentage', () => {
      expect(
        labelOf({ kind: 'PROGRESS', percentage: 63, date: '2026-03-14' })
      ).toBe('63% · 2026-03-14')
    })

    it('shows a partway run as the range it covered', () => {
      expect(
        labelOf({
          kind: 'PROGRESS',
          percentage: null,
          runFrom: 52,
          runTo: 87,
          date: '2026-03-14',
        })
      ).toBe('run 52 → 87% · 2026-03-14')
    })

    it('dates a dateless entry by when it was logged', () => {
      expect(
        labelOf({
          kind: 'PROGRESS',
          percentage: 63,
          date: null,
          loggedAt: '2026-05-02T00:00:00.000Z',
        })
      ).toBe('63% · 2026-05-02')
    })
  })
})
