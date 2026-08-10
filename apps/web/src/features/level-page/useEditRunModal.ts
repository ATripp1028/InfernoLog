// Logic for EditRunModal: the edit form's state, the reset-on-open sync from
// server data, the per-kind field rules (completion vs progress vs drop), and
// the save payload. The component renders fields against what this returns.

import { useEffect, useState } from 'react'
import { toast } from '@/components/ui/sonner'
import {
  maxValueError,
  toDisplay,
  toInternal,
  MAX_ATTEMPTS,
  MAX_FPS,
} from '@/features/logging/format'
import { useMe, type RatingDisplayScale } from '@/lib/api/me'
import type { DateFormatPreference } from '@/lib/api/me'
import { useEditProgress } from '@/lib/api/levelPage'
import { formatEntryDateTime } from '@/lib/dateFormat'
import { isPreTwoTwo } from '@/features/logging/steps/CompletionSessionStep'
import { getViewerTimezone } from '@/lib/timezone'
import type { Device } from '@/lib/api/logging'
import { zonedDateTimeInput, composeZonedDate } from './editDateTime'
import type { DifficultyOpinion } from './EditShared'
import {
  formatRunInputValue,
  parseRunInput,
  type ParsedRun,
} from '@/features/logging/RunInput'
import type { LevelPageData, ProgressUpdate } from './types'

export interface EditRunForm {
  date: string
  time: string
  timezone: string
  dateUncertain: boolean
  attempts: string
  fps: string
  percentageVersion: 'TWO_ONE' | 'TWO_TWO' | null
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
  scale: RatingDisplayScale
): EditRunForm {
  const session = zonedDateTimeInput(update.date, update.dateTimezone)
  return {
    date: session.date,
    time: session.time,
    timezone: update.dateTimezone ?? getViewerTimezone(),
    dateUncertain: update.dateUncertain,
    attempts: update.attempts != null ? String(update.attempts) : '',
    fps: update.fps != null ? String(update.fps) : '',
    percentageVersion:
      (update.percentageVersion as 'TWO_ONE' | 'TWO_TWO' | null) ?? 'TWO_TWO',
    onStream: update.onStream,
    difficultyOpinion:
      (update.difficultyOpinion as DifficultyOpinion | null) ?? null,
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

export function useEditRunModal({
  open,
  onClose,
  data,
  levelId,
  scale,
  datePref,
  progressUpdateId,
}: {
  open: boolean
  onClose: () => void
  data: LevelPageData
  levelId: string
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  progressUpdateId: string | null
}) {
  const update = progressUpdateId
    ? data.progressUpdates.find((u) => u.progressUpdateId === progressUpdateId)
    : undefined
  const me = useMe()
  const editProgress = useEditProgress(levelId)

  const [form, setForm] = useState<EditRunForm>(EMPTY_FORM)
  const [parsedRun, setParsedRun] = useState<ParsedRun | null>(null)

  // Reset from server data every time the dialog opens (or the target
  // entry changes while open) — mirrors the original combined modal's
  // reset-on-open effect, so a cancel-then-reopen never shows stale edits.
  useEffect(() => {
    if (!open || !update) return
    setForm(initForm(update, scale))
    const initialText = formatRunInputValue(
      update.percentage,
      update.runFrom,
      update.runTo
    )
    const result = parseRunInput(initialText)
    setParsedRun(
      result.kind === 'ok' ? { from: result.from, to: result.to } : null
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, progressUpdateId, scale])

  const isCompletion = update?.kind === 'COMPLETION'
  const isDrop = update?.kind === 'DROP'
  const isProgress = update?.kind === 'PROGRESS'

  const completionUpdate = data.progressUpdates.find(
    (u) => u.kind === 'COMPLETION'
  )

  const attemptsError = maxValueError(form.attempts, MAX_ATTEMPTS)
  const fpsError = maxValueError(form.fps, MAX_FPS)
  const runInputMissing = isProgress && parsedRun == null

  function patch(updates: Partial<EditRunForm>) {
    setForm((prev) => ({ ...prev, ...updates }))
  }

  function handleSave() {
    if (!update) return
    const session = composeZonedDate(form.date, form.time, form.timezone)
    if (session === 'invalid') return

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
    handleSave,
    isSaving: editProgress.isPending,
  }
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
