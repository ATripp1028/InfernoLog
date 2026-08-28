// Logic for the edit modal's entry picker: which logged entries you can
// switch between, in which order, and how each is labelled.

import type { DateFormatPreference } from '@/lib/api/wireEnums'
import { formatEntryDate, rangeLabel } from './timelineFormat'
import type { LevelPageData, ProgressUpdate } from '@/lib/api/levelPage'

/** One selectable entry, already labelled for display. */
export interface EntryChoice {
  id: string
  label: string
  kind: ProgressUpdate['kind']
}

/**
 * When an entry happened, as a sortable instant.
 *
 * `date` is what the user says happened; `loggedAt` is when they typed it in.
 * Only the former orders the picker — an old run entered today belongs where
 * it happened, not at the top. Entries with no date at all fall back to
 * `loggedAt`, the same substitution the timeline displays.
 */
function happenedAt(update: ProgressUpdate): number {
  return new Date(update.date ?? update.loggedAt).getTime()
}

/**
 * Every entry on a level, newest first, labelled "<what> · <when>".
 *
 * Ties on the day go to whichever was logged most recently, so two runs
 * entered for the same date still have a stable order. Which of these the
 * modal opens on is {@link defaultEntryChoice}, not simply the head.
 */
export function entryChoices(
  data: LevelPageData,
  datePref: DateFormatPreference
): EntryChoice[] {
  return [...data.progressUpdates]
    .sort((a, b) => {
      const byDate = happenedAt(b) - happenedAt(a)
      if (byDate !== 0) return byDate
      return new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
    })
    .map((update) => ({
      id: update.progressUpdateId,
      kind: update.kind,
      label: `${whatHappened(update)} · ${
        formatEntryDate(
          update.date,
          update.dateTimezone,
          update.loggedAt,
          update.dateUncertain,
          datePref
        ).text
      }`,
    }))
}

/**
 * Which entry the modal opens on: the completion when the level has one,
 * otherwise the most recent.
 *
 * A level holds at most one completion, so "the completion" is unambiguous.
 * It wins the default outright rather than by date because it is the entry
 * carrying the fields unique to finishing a level — the video, the difficulty
 * opinion, the 2-player split. Ordering alone would hand the default to a
 * progress run on any level whose completion happens to be dated earlier,
 * hiding those fields behind the picker on exactly the levels that have them.
 */
export function defaultEntryChoice(choices: EntryChoice[]): EntryChoice | null {
  return (
    choices.find((choice) => choice.kind === 'COMPLETION') ?? choices[0] ?? null
  )
}

// Completions are always 100% and drops track no percentage, so naming the
// kind says more than the number would for those two.
function whatHappened(update: ProgressUpdate): string {
  if (update.kind === 'COMPLETION') return 'Completion'
  if (update.kind === 'DROP') return 'Drop'
  return rangeLabel(update)
}
