import { useEffect, useState } from 'react'
import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import { Label } from '@/components/generic/label'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '../LoggingFlowProvider'
import {
  DateTimeField,
  FieldError,
  FieldLabel,
  LevelHeader,
  StepBody,
  StepFooter,
} from '../components'
import { digitsOnly, maxValueError, MAX_ATTEMPTS } from '../format'
import { GdVersionPicker, GdVersionInfoButton } from '../pickers'
import { isPreTwoTwo } from '../gdVersion'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/generic/popover'
import { Info } from 'lucide-react'
import { RunInput, formatRunInputValue, type ParsedRun } from '../RunInput'

/**
 * Progress step 1: how far the run got, from 0% or from partway through.
 */
export function ProgressStep() {
  const { level, draft, patchDraft, setStep } = useLoggingFlow()
  const me = useMe()

  const defaultPercentageVersion =
    me.data?.defaultPercentageVersion ?? 'TWO_TWO'
  useEffect(() => {
    if (draft.percentageVersion === null) {
      patchDraft({ percentageVersion: defaultPercentageVersion })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPercentageVersion])

  useEffect(() => {
    if (draft.date && isPreTwoTwo(draft.date)) {
      patchDraft({ percentageVersion: 'TWO_ONE' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.date])

  // Tracks the *current* box contents' validity — separate from draft's
  // percentage/runFrom/runTo, which only update on a valid parse and would
  // otherwise stay stale (and wrongly keep Continue enabled) while the box
  // shows invalid/empty text.
  const [parsedRun, setParsedRun] = useState<ParsedRun | null>(() => {
    if (
      draft.progressMode === 'from_run' &&
      draft.runFrom !== '' &&
      draft.runTo !== ''
    ) {
      return {
        from: parseInt(draft.runFrom, 10),
        to: parseInt(draft.runTo, 10),
      }
    }
    if (draft.progressMode === 'from_zero' && draft.percentage !== '') {
      return { from: 0, to: parseInt(draft.percentage, 10) }
    }
    return null
  })

  function handleRunParsed(result: ParsedRun | null) {
    setParsedRun(result)
    if (!result) return
    if (result.from === 0) {
      patchDraft({
        progressMode: 'from_zero',
        percentage: String(result.to),
        runFrom: '',
        runTo: '',
      })
    } else {
      patchDraft({
        progressMode: 'from_run',
        runFrom: String(result.from),
        runTo: String(result.to),
      })
    }
  }

  if (!level) return null

  const showVersionPicker =
    level.levelType === 'CLASSIC' && !isPreTwoTwo(draft.date)
  const attemptsError = maxValueError(draft.attempts, MAX_ATTEMPTS)
  const canContinue = parsedRun != null && !attemptsError

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />

        <div>
          <FieldLabel htmlFor="p-run">This run</FieldLabel>
          <RunInput
            id="p-run"
            initialValue={formatRunInputValue(
              draft.progressMode === 'from_zero' && draft.percentage !== ''
                ? parseInt(draft.percentage, 10)
                : null,
              draft.progressMode === 'from_run' && draft.runFrom !== ''
                ? parseInt(draft.runFrom, 10)
                : null,
              draft.progressMode === 'from_run' && draft.runTo !== ''
                ? parseInt(draft.runTo, 10)
                : null
            )}
            onParsedChange={handleRunParsed}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="p-date">Date</FieldLabel>
            <DateTimeField
              dateId="p-date"
              dateValue={draft.date ?? ''}
              timeValue={draft.time}
              timezoneValue={draft.timezone}
              onDateChange={(v) => patchDraft({ date: v || null })}
              onTimeChange={(v) => patchDraft({ time: v })}
              onTimezoneChange={(v) => patchDraft({ timezone: v })}
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <FieldLabel htmlFor="p-attempts">Attempts</FieldLabel>
              <AttemptsClarification />
            </div>
            <Input
              id="p-attempts"
              inputMode="numeric"
              value={draft.attempts}
              onChange={(e) =>
                patchDraft({ attempts: digitsOnly(e.target.value) })
              }
            />
            {attemptsError && <FieldError>{attemptsError}</FieldError>}
          </div>
        </div>

        {showVersionPicker && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Label>% version</Label>
              <GdVersionInfoButton />
            </div>
            <GdVersionPicker
              value={draft.percentageVersion}
              onChange={(v) => patchDraft({ percentageVersion: v })}
            />
          </div>
        )}
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('find')}>
          Back
        </Button>
        <Button onClick={() => setStep('p_session')} disabled={!canContinue}>
          Continue
        </Button>
      </StepFooter>
    </>
  )
}

function AttemptsClarification() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What counts as an attempt?"
          className="inline-flex size-4 items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-text-secondary"
        >
          <Info size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[280px] space-y-2 p-4 text-sm">
        <p className="text-text-secondary">
          Cumulative across all copies and reuploads.
        </p>
      </PopoverContent>
    </Popover>
  )
}
