// Logic for EditEntryModal: which half is on screen, and the single save that
// writes both halves at once. The two forms themselves stay in
// useEditRunForm/useEditLevelForm, which the standalone modals also use — this
// only composes them, so the merged modal can never drift from either.

import { useEffect, useState } from 'react'
import { toast } from '@/components/generic/sonner'
import { useEditProgress } from '@/lib/api/levelPage'
import type {
  DateFormatPreference,
  RatingDisplayScale,
} from '@/lib/api/wireEnums'
import { findPrimaryProgressUpdateId } from './primaryEntry'
import type { LevelPageData } from './types'
import { useEditRunForm } from './useEditRunModal'
import { useEditLevelForm } from './useEditLevelModal'

/** The two halves of an entry, kept distinct because they save to different rows. */
export type EditEntryTab = 'run' | 'level'

/**
 * Form state for both halves of an entry plus the one mutation that saves them.
 *
 * PATCH /v1/me/progress/:levelId takes LevelProgress and ProgressUpdate fields
 * in the same flat body and applies them in one transaction, so combining the
 * two payloads means a single request — never a half-saved entry.
 */
export function useEditEntryModal({
  open,
  onClose,
  data,
  levelId,
  scale,
  datePref,
}: {
  open: boolean
  onClose: () => void
  data: LevelPageData
  levelId: string
  scale: RatingDisplayScale
  datePref: DateFormatPreference
}) {
  // Completion-first, else the most recent entry — the same target the level
  // page's FAB edits, since neither affordance is scoped to one Timeline card.
  const progressUpdateId = findPrimaryProgressUpdateId(data)
  const run = useEditRunForm({
    open,
    data,
    scale,
    datePref,
    progressUpdateId,
  })
  const level = useEditLevelForm({ open, data, levelId, scale })
  const editProgress = useEditProgress(levelId)

  const hasRun = progressUpdateId != null
  const [tab, setTab] = useState<EditEntryTab>('run')

  // Open on the run half whenever there is one — it holds the fields that
  // change most often. Reset per open so a reopen never lands on whichever
  // tab was last used for some other level.
  useEffect(() => {
    if (open) setTab(hasRun ? 'run' : 'level')
  }, [open, levelId, hasRun])

  const runError = run.hasFieldError
  const levelError = level.gddlTierError != null

  function handleSave() {
    const levelPayload = level.buildPayload()
    if (!levelPayload) {
      setTab('level')
      return
    }

    let payload = levelPayload
    if (hasRun) {
      const runPayload = run.buildPayload()
      if (!runPayload) {
        setTab('run')
        return
      }
      // The two halves write disjoint fields, so a plain merge is a complete
      // body — the run half spreads last only to keep progressUpdateId last.
      payload = { ...levelPayload, ...runPayload }
    }

    editProgress.mutate(payload, {
      onSuccess: () => {
        toast.success('Changes saved')
        onClose()
      },
      onError: () => {
        toast.error('Failed to save changes')
      },
    })
  }

  return {
    // Both halves need the user's rating config before they can render.
    ready: level.ready,
    run,
    level,
    // A level with no logged entry at all can't happen through the app, but
    // the run half has nothing to target if it ever did.
    hasRun,
    tab,
    setTab,
    runError,
    levelError,
    // Which entry the run half is editing ("your completion", "progress from …").
    entryLabel: run.entryLabel,
    levelName: level.levelName,
    handleSave,
    isSaving: editProgress.isPending,
    hasFieldError: runError || levelError,
  }
}
