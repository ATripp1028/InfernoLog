// Logic for the run half of the edit modals: the edit form's state, the
// reset-on-open sync from server data, the per-kind field rules (completion
// vs progress vs drop), and the save payload. `useEditRunForm` holds all of
// that and is what the merged EditEntryModal composes; `useEditRunModal`
// wraps it with the mutation the standalone EditRunModal saves through.

import { useEffect, useState } from 'react'
import { toast } from '@/components/generic/sonner'
import { maxValueError, MAX_ATTEMPTS, MAX_FPS } from '@/lib/numberFormat'
import { toDisplay, toInternal } from '@/lib/ratingScale'
import { useMe } from '@/lib/api/me'
import { useEditProgress } from '@/lib/api/levelPage'
import { formatEntryDateTime } from '@/lib/dateFormat'
import { isPreTwoTwo } from '@/lib/gdVersion'
import { getViewerTimezone } from '@/lib/timezone'
import type {
  DateFormatPreference,
  Device,
  DifficultyOpinion,
  GdVersion,
  RatingDisplayScale,
} from '@/lib/api/wireEnums'
import { zonedDateTimeInput, composeZonedDate } from './editDateTime'
import {
  formatRunInputValue,
  parseRunInput,
  type ParsedRun,
} from '@/lib/runParsing'
import type { LevelPageData, ProgressUpdate } from '@/lib/api/levelPage'

/**
 * The edit-run form state. Ratings are held in DISPLAY units and converted on save.
 */
export interface EditRunForm {
  date: string
  time: string
  timezone: string
  dateUncertain: boolean
  attempts: string
  fps: string
  percentageVersion: GdVersion | null
  onStream: boolean
  difficultyOpinion: DifficultyOpinion | null
  enjoyment: number | null
  videoUrl: string
  highlightUrl: string
  notes: string
  twoPlayerSolo: boolean | null
  twoPlayerPartner: string
  device: Device | null
}

const EMPTY_FORM: EditRunForm = {
  date: '',
  time: '',
  timezone: getViewerTimezone(),
  dateUncertain: false,
  attempts: '',
  fps: '',
  percentageVersion: 'TWO_TWO',
  onStream: false,
  difficultyOpinion: null,
  enjoyment: null,
  videoUrl: '',
  highlightUrl: '',
  notes: '',
  twoPlayerSolo: null,
  twoPlayerPartner: '',
  device: null,
}

function initForm(
  update: ProgressUpdate,
  scale: RatingDisplayScale,
  // Level-scoped (LevelProgress), unlike everything else here — so it is
  // passed in rather than read off the update.
  difficultyOpinion: string | null
): EditRunForm {
  const session = zonedDateTimeInput(update.date, update.dateTimezone)
  return {
    date: session.date,
    time: session.time,
    timezone: update.dateTimezone ?? getViewerTimezone(),
    dateUncertain: update.dateUncertain,
    attempts: update.attempts != null ? String(update.attempts) : '',
    fps: update.fps != null ? String(update.fps) : '',
    percentageVersion: update.percentageVersion ?? 'TWO_TWO',
    onStream: update.onStream,
    difficultyOpinion: (difficultyOpinion as DifficultyOpinion | null) ?? null,
    enjoyment:
      update.enjoyment != null ? toDisplay(update.enjoyment, scale) : null,
    videoUrl: update.videoUrl ?? '',
    highlightUrl: update.highlightUrl ?? '',
    notes: update.notes ?? '',
    twoPlayerSolo: update.twoPlayerSolo ?? null,
    twoPlayerPartner: update.twoPlayerPartner ?? '',
    device: (update.device as Device | null | undefined) ?? null,
  }
}

// The run text an entry starts out showing, and what that parses to. Kept
// beside initForm because the two together are the form's pristine state.
function initParsedRun(update: ProgressUpdate): ParsedRun | null {
  const result = parseRunInput(
    formatRunInputValue(update.percentage, update.runFrom, update.runTo)
  )
  return result.kind === 'ok' ? { from: result.from, to: result.to } : null
}

/** What {@link useEditRunForm} hands the fields component. */
export type EditRunFormState = ReturnType<typeof useEditRunForm>

/**
 * Form state, validation, and the PATCH payload for one logged update — everything but the mutation.
 */
export function useEditRunForm({
  open,
  data,
  scale,
  datePref,
  progressUpdateId,
}: {
  open: boolean
  data: LevelPageData
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  progressUpdateId: string | null
}) {
  const update = progressUpdateId
    ? data.progressUpdates.find((u) => u.progressUpdateId === progressUpdateId)
    : undefined
  const me = useMe()

  const [form, setForm] = useState<EditRunForm>(EMPTY_FORM)
  const [parsedRun, setParsedRun] = useState<ParsedRun | null>(null)
  // The form exactly as it was loaded. Captured alongside the reset rather
  // than recomputed from `data`, since the reset deliberately ignores
  // background refetches — comparing against a moving `data` would report
  // the form as dirty when nobody typed anything.
  const [pristine, setPristine] = useState<{
    form: EditRunForm
    run: ParsedRun | null
  } | null>(null)

  // Reset from server data every time the dialog opens (or the target
  // entry changes while open) — mirrors the original combined modal's
  // reset-on-open effect, so a cancel-then-reopen never shows stale edits.
  useEffect(() => {
    if (!open || !update) return
    const initialForm = initForm(update, scale, data.difficultyOpinion)
    const initialRun = initParsedRun(update)
    setForm(initialForm)
    setParsedRun(initialRun)
    setPristine({ form: initialForm, run: initialRun })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, progressUpdateId, scale, data.difficultyOpinion])

  const isCompletion = update?.kind === 'COMPLETION'
  const isDrop = update?.kind === 'DROP'
  const isProgress = update?.kind === 'PROGRESS'

  const completionUpdate = data.progressUpdates.find(
    (u) => u.kind === 'COMPLETION'
  )

  const attemptsError = maxValueError(form.attempts, MAX_ATTEMPTS)
  const fpsError = maxValueError(form.fps, MAX_FPS)
  const runInputMissing = isProgress && parsedRun == null

  // Whether anything has been typed since this entry was loaded. Every field
  // is a scalar, so a key-by-key compare against the pristine form is the
  // whole check. Read when the entry picker wants to swap the form out from
  // under the user — see useEditEntryModal.
  const isDirty =
    update != null &&
    pristine != null &&
    ((Object.keys(pristine.form) as (keyof EditRunForm)[]).some(
      (key) => form[key] !== pristine.form[key]
    ) ||
      parsedRun?.from !== pristine.run?.from ||
      parsedRun?.to !== pristine.run?.to)

  function patch(updates: Partial<EditRunForm>) {
    setForm((prev) => ({ ...prev, ...updates }))
  }

  /**
   * The PATCH body for this form, or null when there is nothing editable or
   * the composed date is unusable — in which case the caller must not save.
   */
  function buildPayload(): Record<string, unknown> | null {
    if (!update) return null
    const session = composeZonedDate(form.date, form.time, form.timezone)
    if (session === 'invalid') return null

    const payload: Record<string, unknown> = {
      progressUpdateId: update.progressUpdateId,
      ...session,
      dateUncertain: form.dateUncertain,
      attempts: form.attempts !== '' ? parseInt(form.attempts, 10) : null,
      fps: form.fps !== '' ? parseInt(form.fps, 10) : null,
      percentageVersion: form.percentageVersion,
      onStream: form.onStream,
      notes: form.notes || null,
      device: form.device,
      enjoyment:
        form.enjoyment != null ? toInternal(form.enjoyment, scale) : null,
    }

    if (isProgress && parsedRun) {
      if (parsedRun.from === 0) {
        payload.percentage = parsedRun.to
      } else {
        payload.runFrom = parsedRun.from
        payload.runTo = parsedRun.to
      }
    }

    if (isCompletion) {
      payload.difficultyOpinion = form.difficultyOpinion
      payload.videoUrl = form.videoUrl || null
      payload.highlightUrl = form.highlightUrl || null
      if (data.level.twoPlayer) {
        payload.twoPlayerSolo = form.twoPlayerSolo
        payload.twoPlayerPartner =
          form.twoPlayerSolo === false ? form.twoPlayerPartner || null : null
      }
    }

    return payload
  }

  return {
    // Null until both the target entry and the user's settings are available;
    // the modal renders nothing in that case.
    ready: !!update && !!me.data,
    update,
    form,
    patch,
    parsedRun,
    setParsedRun,

    // Which fields this entry kind shows
    isCompletion,
    isDrop,
    isProgress,
    showHighlightUrl: me.data?.showHighlightUrl ?? false,
    showTwoPlayer: !!data.level.twoPlayer,
    // 2.1-era completions have no version to pick — the completion itself
    // already pins the percentage basis.
    showVersionPicker:
      data.level.levelType === 'CLASSIC' &&
      !(
        completionUpdate?.date != null &&
        isPreTwoTwo(String(completionUpdate.date))
      ),

    // Validation
    attemptsError,
    fpsError,
    runInputMissing,
    hasFieldError: attemptsError != null || fpsError != null || runInputMissing,

    entryLabel: update ? entryLabelFor(update, datePref) : '',
    isDirty,
    buildPayload,
  }
}

/**
 * Form state, validation, and the save mutation for one logged update.
 */
export function useEditRunModal(args: {
  open: boolean
  onClose: () => void
  data: LevelPageData
  levelId: string
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  progressUpdateId: string | null
}) {
  const { onClose, levelId } = args
  const state = useEditRunForm(args)
  const editProgress = useEditProgress(levelId)

  function handleSave() {
    const payload = state.buildPayload()
    if (!payload) return

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

  return { ...state, handleSave, isSaving: editProgress.isPending }
}

// "Editing <x>" subtitle — completions and drops are unique per level, so
// only progress entries need their date to disambiguate.
function entryLabelFor(
  update: ProgressUpdate,
  datePref: DateFormatPreference
): string {
  if (update.kind === 'COMPLETION') return 'your completion'
  if (update.kind === 'DROP') return 'your drop'
  const { dateText } = formatEntryDateTime(
    update.date ?? update.loggedAt,
    update.dateTimezone,
    datePref,
    getViewerTimezone()
  )
  return `progress from ${dateText}`
}
