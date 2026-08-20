// Logic for EditEntryModal: which half is on screen, and the single save that
// writes both halves at once. The two forms themselves stay in
// useEditRunForm/useEditLevelForm, which the standalone modals also use — this
// only composes them, so the merged modal can never drift from either.

import { useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/generic/sonner'
import { useEditProgress } from '@/lib/api/levelPage'
import type {
  DateFormatPreference,
  RatingDisplayScale,
} from '@/lib/api/wireEnums'
import {
  defaultEntryChoice,
  entryChoices,
  type EntryChoice,
} from './entryChoices'
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
  // Newest first for the picker; the completion, if any, for the default.
  const choices = useMemo(() => entryChoices(data, datePref), [data, datePref])
  const defaultEntryId = defaultEntryChoice(choices)?.id ?? null

  const [entryId, setEntryId] = useState<string | null>(defaultEntryId)
  // The switch waiting on the user's answer, once one would throw away edits.
  const [pendingEntry, setPendingEntry] = useState<EntryChoice | null>(null)

  const progressUpdateId =
    choices.find((c) => c.id === entryId)?.id ?? defaultEntryId
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
  // tab, or entry, was last used for some other level.
  useEffect(() => {
    if (!open) return
    setTab(hasRun ? 'run' : 'level')
    setEntryId(defaultEntryId)
    setPendingEntry(null)
  }, [open, levelId, hasRun, defaultEntryId])

  /**
   * Point the run half at another entry. Loading one replaces the form, so a
   * switch away from unsaved edits asks first. The level half is untouched
   * either way — it isn't scoped to an entry, so its edits always survive.
   */
  function selectEntry(id: string) {
    if (id === progressUpdateId) return
    if (run.isDirty) {
      setPendingEntry(choices.find((c) => c.id === id) ?? null)
      return
    }
    setEntryId(id)
  }

  function confirmSwitch() {
    if (pendingEntry) setEntryId(pendingEntry.id)
    setPendingEntry(null)
  }

  function cancelSwitch() {
    setPendingEntry(null)
  }

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
    // The entry picker: every entry newest-first, which one is loaded, and
    // the switch held back because it would discard edits.
    choices,
    entryId: progressUpdateId,
    selectEntry,
    pendingEntry,
    confirmSwitch,
    cancelSwitch,
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
