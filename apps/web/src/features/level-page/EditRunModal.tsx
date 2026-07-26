import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { FieldError } from '@/components/ui/field-error'
import { toast } from '@/components/ui/sonner'
import {
  digitsOnly,
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
import {
  DevicePicker,
  GdVersionPicker,
  GdVersionInfoButton,
  isPreTwoTwo,
} from '@/features/logging/steps/CompletionSessionStep'
import { DateTimeField } from '@/features/logging/components'
import {
  getViewerTimezone,
  zonedTimeToUtc,
  NonexistentLocalTimeError,
} from '@/lib/timezone'
import type { Device } from '@/lib/api/logging'
import {
  Section,
  FieldLabel,
  Textarea,
  RatingRow,
  DifficultyOpinionSelect,
  EditTwoPlayerSection,
  zonedDateTimeInput,
  type DifficultyOpinion,
} from './EditShared'
import {
  RunInput,
  formatRunInputValue,
  parseRunInput,
  type ParsedRun,
} from './RunInput'
import type { LevelPageData, ProgressUpdate } from './types'

interface EditRunForm {
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

function initForm(update: ProgressUpdate, scale: RatingDisplayScale): EditRunForm {
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
    difficultyOpinion: (update.difficultyOpinion as DifficultyOpinion | null) ?? null,
    enjoyment: update.enjoyment != null ? toDisplay(update.enjoyment, scale) : null,
    videoUrl: update.videoUrl ?? '',
    highlightUrl: update.highlightUrl ?? '',
    notes: update.notes ?? '',
    twoPlayerSolo: update.twoPlayerSolo ?? null,
    twoPlayerPartner: update.twoPlayerPartner ?? '',
    device: (update.device as Device | null | undefined) ?? null,
  }
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

interface EditRunModalProps {
  open: boolean
  onClose: () => void
  data: LevelPageData
  levelId: string
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  // The specific entry being edited — resolved by the caller (Timeline's
  // per-entry pencil, or the FAB's completion-first-else-newest default)
  // before opening. Null only while no entry is selected (dialog closed).
  progressUpdateId: string | null
}

export function EditRunModal({
  open,
  onClose,
  data,
  levelId,
  scale,
  datePref,
  progressUpdateId,
}: EditRunModalProps) {
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
    setParsedRun(result.kind === 'ok' ? { from: result.from, to: result.to } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, progressUpdateId, scale])

  if (!update || !me.data) return null

  const isCompletion = update.kind === 'COMPLETION'
  const isDrop = update.kind === 'DROP'
  const isProgress = update.kind === 'PROGRESS'
  const showHighlightUrl = me.data.showHighlightUrl
  const completionUpdate = data.progressUpdates.find(
    (u) => u.kind === 'COMPLETION'
  )
  const showVersionPicker =
    data.level.levelType === 'CLASSIC' &&
    !(
      completionUpdate?.date != null &&
      isPreTwoTwo(String(completionUpdate.date))
    )

  const attemptsError = maxValueError(form.attempts, MAX_ATTEMPTS)
  const fpsError = maxValueError(form.fps, MAX_FPS)
  const runInputMissing = isProgress && parsedRun == null
  const hasFieldError =
    attemptsError != null || fpsError != null || runInputMissing

  function patch(updates: Partial<EditRunForm>) {
    setForm((prev) => ({ ...prev, ...updates }))
  }

  const entryLabel = isCompletion
    ? 'your completion'
    : isDrop
      ? 'your drop'
      : `progress from ${
          formatEntryDateTime(
            update.date ?? update.loggedAt,
            update.dateTimezone,
            datePref,
            getViewerTimezone()
          ).dateText
        }`

  function handleSave() {
    if (!update) return
    let session: { date: string | null; dateTimezone: string | null }
    try {
      session = form.date
        ? form.time
          ? {
              date: zonedTimeToUtc(
                form.date,
                form.time,
                form.timezone
              ).toISOString(),
              dateTimezone: form.timezone,
            }
          : { date: form.date, dateTimezone: null }
        : { date: null, dateTimezone: null }
    } catch (err) {
      if (err instanceof NonexistentLocalTimeError) {
        toast.error(
          "That time doesn't exist in the selected time zone (daylight saving change) — pick a different time."
        )
        return
      }
      throw err
    }

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
      enjoyment: form.enjoyment != null ? toInternal(form.enjoyment, scale) : null,
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

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 focus:outline-none',
            'md:left-1/2 md:top-1/2 md:right-auto md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2',
            'inset-x-0 bottom-0 w-full md:w-[540px]'
          )}
        >
          <div className="flex max-h-[92vh] flex-col rounded-t-card border border-border bg-bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] md:max-h-[calc(100vh-4rem)] md:rounded-card">
            <div className="flex justify-center pb-1 pt-2 md:hidden">
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>

            <div className="flex items-start justify-between px-5 pb-3 pt-4 md:pt-5">
              <div>
                <Dialog.Title className="text-lg font-semibold text-text-primary">
                  Edit run
                </Dialog.Title>
                <p className="mt-0.5 text-sm text-text-secondary">
                  Editing {entryLabel}
                </p>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="mt-0.5 flex size-8 items-center justify-center rounded-md bg-bg-elevated text-text-secondary transition-colors hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-2 pt-1">
              <Section label="Details">
                {isProgress && (
                  <div>
                    <FieldLabel htmlFor="er-run">This run</FieldLabel>
                    <RunInput
                      id="er-run"
                      initialValue={formatRunInputValue(
                        update.percentage,
                        update.runFrom,
                        update.runTo
                      )}
                      onParsedChange={setParsedRun}
                    />
                  </div>
                )}

                <div>
                  <FieldLabel htmlFor="er-date">Date</FieldLabel>
                  <DateTimeField
                    dateId="er-date"
                    dateValue={form.date}
                    timeValue={form.time}
                    timezoneValue={form.timezone}
                    onDateChange={(v) => patch({ date: v })}
                    onTimeChange={(v) => patch({ time: v })}
                    onTimezoneChange={(v) => patch({ timezone: v })}
                  />
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                    <Switch
                      checked={form.dateUncertain}
                      onCheckedChange={(v) => patch({ dateUncertain: v })}
                    />
                    Date is uncertain
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel htmlFor="er-attempts">Attempts</FieldLabel>
                    <Input
                      id="er-attempts"
                      inputMode="numeric"
                      placeholder="—"
                      value={form.attempts}
                      onChange={(e) =>
                        patch({ attempts: digitsOnly(e.target.value) })
                      }
                    />
                    {attemptsError && <FieldError>{attemptsError}</FieldError>}
                  </div>
                  <div>
                    <FieldLabel htmlFor="er-fps">FPS</FieldLabel>
                    <Input
                      id="er-fps"
                      inputMode="numeric"
                      placeholder="—"
                      value={form.fps}
                      onChange={(e) =>
                        patch({ fps: digitsOnly(e.target.value) })
                      }
                    />
                    {fpsError && <FieldError>{fpsError}</FieldError>}
                  </div>
                </div>

                {showVersionPicker && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <FieldLabel>% version</FieldLabel>
                      <GdVersionInfoButton />
                    </div>
                    <GdVersionPicker
                      value={form.percentageVersion}
                      onChange={(v) => patch({ percentageVersion: v })}
                    />
                  </div>
                )}

                <div>
                  <FieldLabel>Device</FieldLabel>
                  <DevicePicker
                    value={form.device}
                    onChange={(v) => patch({ device: v })}
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                  <Switch
                    checked={form.onStream}
                    onCheckedChange={(v) => patch({ onStream: v })}
                  />
                  On stream
                </label>
              </Section>

              {isCompletion && (
                <Section label="Difficulty">
                  <DifficultyOpinionSelect
                    value={form.difficultyOpinion}
                    onChange={(v) => patch({ difficultyOpinion: v })}
                  />
                </Section>
              )}

              {isCompletion && data.level.twoPlayer && (
                <EditTwoPlayerSection
                  solo={form.twoPlayerSolo}
                  partner={form.twoPlayerPartner}
                  onSoloChange={(v) =>
                    patch({ twoPlayerSolo: v, twoPlayerPartner: '' })
                  }
                  onPartnerChange={(v) => patch({ twoPlayerPartner: v })}
                />
              )}

              <Section label="Rating">
                <RatingRow
                  label="Enjoyment"
                  value={form.enjoyment}
                  scale={scale}
                  onChange={(v) => patch({ enjoyment: v })}
                />
              </Section>

              {isCompletion && (
                <Section label="Media">
                  <div>
                    <FieldLabel htmlFor="er-video">Video URL</FieldLabel>
                    <Input
                      id="er-video"
                      type="url"
                      placeholder="https://..."
                      value={form.videoUrl}
                      onChange={(e) => patch({ videoUrl: e.target.value })}
                    />
                  </div>
                  {showHighlightUrl && (
                    <div>
                      <FieldLabel htmlFor="er-highlight">
                        Highlight URL
                      </FieldLabel>
                      <Input
                        id="er-highlight"
                        type="url"
                        placeholder="https://..."
                        value={form.highlightUrl}
                        onChange={(e) =>
                          patch({ highlightUrl: e.target.value })
                        }
                      />
                    </div>
                  )}
                </Section>
              )}

              <Section label="Notes">
                <div>
                  <FieldLabel htmlFor="er-notes">Notes on this run</FieldLabel>
                  <Textarea
                    id="er-notes"
                    placeholder="Notes about this session…"
                    value={form.notes}
                    onChange={(e) => patch({ notes: e.target.value })}
                    maxLength={2000}
                  />
                </div>
              </Section>

              <div className="h-2" />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={editProgress.isPending || hasFieldError}
              >
                {editProgress.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
