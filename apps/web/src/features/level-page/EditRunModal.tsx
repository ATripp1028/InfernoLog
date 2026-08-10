import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  dialogContentAnimation,
  dialogOverlayAnimation,
} from '@/lib/dialogAnimation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { FieldError } from '@/components/ui/field-error'
import { digitsOnly } from '@/features/logging/format'
import type { RatingDisplayScale, DateFormatPreference } from '@/lib/api/me'
import {
  DevicePicker,
  GdVersionPicker,
  GdVersionInfoButton,
} from '@/features/logging/steps/CompletionSessionStep'
import { DateTimeField } from '@/features/logging/components'
import {
  Section,
  FieldLabel,
  Textarea,
  RatingRow,
  DifficultyOpinionSelect,
  EditTwoPlayerSection,
} from './EditShared'
import { RunInput, formatRunInputValue } from '@/features/logging/RunInput'
import type { LevelPageData } from './types'
import { useEditRunModal } from './useEditRunModal'

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
  const {
    ready,
    update,
    form,
    patch,
    setParsedRun,
    isCompletion,
    isProgress,
    showHighlightUrl,
    showVersionPicker,
    attemptsError,
    fpsError,
    entryLabel,
    hasFieldError,
    handleSave,
    isSaving,
  } = useEditRunModal({
    open,
    onClose,
    data,
    levelId,
    scale,
    datePref,
    progressUpdateId,
  })

  if (!ready || !update) return null

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm',
            dialogOverlayAnimation
          )}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 focus:outline-none',
            dialogContentAnimation,
            'md:left-1/2 md:top-1/2 md:right-auto md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2',
            'inset-x-0 bottom-0 w-full md:w-[540px]'
          )}
        >
          <div className="flex max-h-[92dvh] flex-col rounded-t-card border border-border bg-bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] md:max-h-[calc(100vh-4rem)] md:rounded-card">
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
              <Button onClick={handleSave} disabled={isSaving || hasFieldError}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
