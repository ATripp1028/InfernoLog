import { Button } from '@/components/generic/button'
import { Textarea } from '@/components/generic/textarea'
import { Input } from '@/components/generic/input'
import { Switch } from '@/components/generic/switch'
import { toast } from '@/components/generic/sonner'
import { useLogDrop } from '@/lib/api/logging'
import { useFlowBusy, useLoggingFlow } from '../LoggingFlowProvider'
import {
  DateTimeField,
  FieldError,
  FieldHint,
  FieldLabel,
  LevelHeader,
  StepBody,
  StepFooter,
} from '../components'
import { buildDropInput, loggingErrorMessage } from '../payload'
import {
  clampPercent,
  digitsOnly,
  maxValueError,
  MAX_ATTEMPTS,
} from '../format'

/**
 * The drop path: date, attempts, worst fail, and an optional reason.
 */
export function DropStep() {
  const { level, draft, patchDraft, setStep, close } = useLoggingFlow()
  const logDrop = useLogDrop()
  useFlowBusy(logDrop.isPending)
  if (!level) return null

  const attemptsError = maxValueError(draft.attempts, MAX_ATTEMPTS)

  async function submit() {
    if (!level) return
    try {
      await logDrop.mutateAsync(buildDropInput(level, draft))
      toast.success(`Dropped ${level.name ?? 'level'}`)
      close()
    } catch (err) {
      toast.error(loggingErrorMessage(err, 'Could not drop level'))
    }
  }

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />
        <p className="text-sm text-text-secondary">
          Your progress history stays intact — you can pick it back up anytime.
        </p>

        <div>
          <FieldLabel htmlFor="d-date">Date dropped</FieldLabel>
          <DateTimeField
            dateId="d-date"
            dateValue={draft.date ?? ''}
            timeValue={draft.time}
            timezoneValue={draft.timezone}
            onDateChange={(v) => patchDraft({ date: v || null })}
            onTimeChange={(v) => patchDraft({ time: v })}
            onTimezoneChange={(v) => patchDraft({ timezone: v })}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="d-attempts" hint="Worth logging.">
              Attempts (optional)
            </FieldLabel>
            <Input
              id="d-attempts"
              inputMode="numeric"
              value={draft.attempts}
              onChange={(e) =>
                patchDraft({ attempts: digitsOnly(e.target.value) })
              }
            />
            {attemptsError ? (
              <FieldError>{attemptsError}</FieldError>
            ) : (
              <FieldHint>
                Puts your eventual completion&apos;s attempt count in
                perspective.
              </FieldHint>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel
                htmlFor="d-worstfail"
                hint="Your best run from 0% before dropping."
              >
                Worst fail %
              </FieldLabel>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.worstFailAlreadyLogged}
                  onChange={(e) =>
                    patchDraft({ worstFailAlreadyLogged: e.target.checked })
                  }
                  className="rounded border-border"
                />
                Already logged
              </label>
            </div>
            <Input
              id="d-worstfail"
              inputMode="numeric"
              disabled={draft.worstFailAlreadyLogged}
              value={draft.worstFail}
              onChange={(e) =>
                patchDraft({ worstFail: clampPercent(e.target.value) })
              }
            />
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={draft.worstFailSameDay}
                disabled={draft.worstFailAlreadyLogged}
                onChange={(e) =>
                  patchDraft({ worstFailSameDay: e.target.checked })
                }
                className="rounded border-border"
              />
              Same day as drop
            </label>
            {!draft.worstFailSameDay && (
              <DateTimeField
                dateId="d-worstfaildate"
                disabled={draft.worstFailAlreadyLogged}
                dateValue={draft.worstFailDate}
                timeValue={draft.worstFailTime}
                timezoneValue={draft.worstFailTimezone}
                onDateChange={(v) => patchDraft({ worstFailDate: v })}
                onTimeChange={(v) => patchDraft({ worstFailTime: v })}
                onTimezoneChange={(v) => patchDraft({ worstFailTimezone: v })}
              />
            )}
            {draft.worstFailAlreadyLogged ? (
              <FieldHint>Keeping your previously logged worst fail.</FieldHint>
            ) : (
              <FieldHint>% and date of your best run from 0%.</FieldHint>
            )}
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="d-reason">Reason (optional)</FieldLabel>
          <Textarea
            id="d-reason"
            value={draft.droppedReason}
            onChange={(e) => patchDraft({ droppedReason: e.target.value })}
            rows={3}
            maxLength={2000}
            placeholder="Why are you setting this aside?"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">
              Keep this private
            </p>
            <p className="text-xs text-text-tertiary">
              Hide the drop from your public profile.
            </p>
          </div>
          <Switch
            checked={draft.visibility === 'PRIVATE'}
            onCheckedChange={(v) =>
              patchDraft({ visibility: v ? 'PRIVATE' : 'PUBLIC' })
            }
          />
        </div>
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('find')}>
          Back
        </Button>
        <Button
          variant="destructive"
          onClick={submit}
          disabled={logDrop.isPending || attemptsError != null}
        >
          {logDrop.isPending ? 'Dropping…' : 'Drop level'}
        </Button>
      </StepFooter>
    </>
  )
}
