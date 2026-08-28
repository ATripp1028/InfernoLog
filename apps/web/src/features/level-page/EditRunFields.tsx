import { Input } from '@/components/generic/input'
import { Switch } from '@/components/generic/switch'
import { FieldError } from '@/components/generic/field-error'
import { digitsOnly } from '@/lib/numberFormat'
import type { RatingDisplayScale } from '@/lib/api/wireEnums'
import {
  DevicePicker,
  GdVersionPicker,
  GdVersionInfoButton,
} from '@/components/inputs/pickers'
import { DateTimeField } from '@/components/inputs/DateTimeField'
import {
  Section,
  FieldLabel,
  Textarea,
  RatingRow,
  TwoPlayerPicker,
} from './EditShared'
import { DifficultyOpinionSelect } from '@/components/inputs/DifficultyOpinionSelect'
import { RunInput } from '@/components/inputs/RunInput'
import { formatRunInputValue } from '@/lib/runParsing'
import type { EditRunFormState } from './useEditRunModal'

/**
 * The ProgressUpdate-scoped fields — everything that belongs to one logged
 * run rather than to the level. Rendered on its own by EditRunModal and as
 * the "This run" tab of EditEntryModal, so the two can never drift.
 */
export function EditRunFields({
  state,
  scale,
  idPrefix = 'er',
}: {
  state: EditRunFormState
  scale: RatingDisplayScale
  /** Namespaces the field ids, so two forms can coexist in one dialog. */
  idPrefix?: string
}) {
  const {
    update,
    form,
    patch,
    setParsedRun,
    isCompletion,
    isProgress,
    showHighlightUrl,
    showVersionPicker,
    showTwoPlayer,
    attemptsError,
    fpsError,
  } = state
  if (!update) return null
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <>
      <Section label="Details">
        {isProgress && (
          <div>
            <FieldLabel htmlFor={id('run')}>This run</FieldLabel>
            <RunInput
              // Seeded from initialValue and uncontrolled thereafter, so
              // switching entries has to remount it or it keeps showing the
              // previous entry's run.
              key={update.progressUpdateId}
              id={id('run')}
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
          <FieldLabel htmlFor={id('date')}>Date</FieldLabel>
          <DateTimeField
            dateId={id('date')}
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
            <FieldLabel htmlFor={id('attempts')}>Attempts</FieldLabel>
            <Input
              id={id('attempts')}
              inputMode="numeric"
              placeholder="—"
              value={form.attempts}
              onChange={(e) => patch({ attempts: digitsOnly(e.target.value) })}
            />
            {attemptsError && <FieldError>{attemptsError}</FieldError>}
          </div>
          <div>
            <FieldLabel htmlFor={id('fps')}>FPS</FieldLabel>
            <Input
              id={id('fps')}
              inputMode="numeric"
              placeholder="—"
              value={form.fps}
              onChange={(e) => patch({ fps: digitsOnly(e.target.value) })}
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

      {isCompletion && showTwoPlayer && (
        <Section label="2-Player">
          <TwoPlayerPicker
            solo={form.twoPlayerSolo}
            partner={form.twoPlayerPartner}
            onSoloChange={(v) =>
              patch({ twoPlayerSolo: v, twoPlayerPartner: '' })
            }
            onPartnerChange={(v) => patch({ twoPlayerPartner: v })}
            partnerInputId={id('partner')}
            partnerLabel={
              <FieldLabel htmlFor={id('partner')}>Partner</FieldLabel>
            }
          />
        </Section>
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
            <FieldLabel htmlFor={id('video')}>Video URL</FieldLabel>
            <Input
              id={id('video')}
              type="url"
              placeholder="https://..."
              value={form.videoUrl}
              onChange={(e) => patch({ videoUrl: e.target.value })}
            />
          </div>
          {showHighlightUrl && (
            <div>
              <FieldLabel htmlFor={id('highlight')}>Highlight URL</FieldLabel>
              <Input
                id={id('highlight')}
                type="url"
                placeholder="https://..."
                value={form.highlightUrl}
                onChange={(e) => patch({ highlightUrl: e.target.value })}
              />
            </div>
          )}
        </Section>
      )}

      <Section label="Notes">
        <div>
          <FieldLabel htmlFor={id('notes')}>Notes on this run</FieldLabel>
          <Textarea
            id={id('notes')}
            placeholder="Notes about this session…"
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            maxLength={2000}
          />
        </div>
      </Section>
    </>
  )
}
