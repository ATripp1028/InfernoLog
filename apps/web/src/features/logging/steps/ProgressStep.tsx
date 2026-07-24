import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '../LoggingFlowProvider'
import {
  FieldError,
  FieldHint,
  FieldLabel,
  LevelHeader,
  StepBody,
  StepFooter,
} from '../components'
import { digitsOnly, maxValueError, MAX_ATTEMPTS } from '../format'

// Run-from/run-to/best-progress are all percentages (server-bounded 0-100).
const MAX_PERCENT = 100
import {
  GdVersionPicker,
  GdVersionInfoButton,
  isPreTwoTwo,
} from './CompletionSessionStep'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Info } from 'lucide-react'

const MODE_OPTIONS = [
  { value: 'from_zero', label: 'From 0%' },
  { value: 'from_run', label: 'From a run' },
] as const

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

  if (!level) return null

  const fromRun = draft.progressMode === 'from_run'
  const showVersionPicker =
    level.levelType === 'CLASSIC' && !isPreTwoTwo(draft.date)
  const runFromError = maxValueError(draft.runFrom, MAX_PERCENT)
  const runToError = maxValueError(draft.runTo, MAX_PERCENT)
  const percentageError = maxValueError(draft.percentage, MAX_PERCENT)
  const attemptsError = maxValueError(draft.attempts, MAX_ATTEMPTS)
  const canContinue = fromRun
    ? draft.runFrom.trim() !== '' &&
      draft.runTo.trim() !== '' &&
      !runFromError &&
      !runToError &&
      !attemptsError
    : draft.percentage.trim() !== '' && !percentageError && !attemptsError

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />
        <FieldHint>
          Pick &quot;From a run&quot; to log a segment (e.g. 30% → 63%), or &quot;
          From 0%&quot; to log progress from the start.
        </FieldHint>

        <div>
          <FieldLabel>This run</FieldLabel>
          <Segmented
            options={MODE_OPTIONS}
            value={draft.progressMode}
            onChange={(v) => patchDraft({ progressMode: v })}
          />
        </div>

        {fromRun ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="p-from">Run from %</FieldLabel>
              <Input
                id="p-from"
                inputMode="numeric"
                value={draft.runFrom}
                onChange={(e) =>
                  patchDraft({ runFrom: digitsOnly(e.target.value) })
                }
              />
              {runFromError && <FieldError>{runFromError}</FieldError>}
            </div>
            <div>
              <FieldLabel htmlFor="p-to">Run to %</FieldLabel>
              <Input
                id="p-to"
                inputMode="numeric"
                value={draft.runTo}
                onChange={(e) =>
                  patchDraft({ runTo: digitsOnly(e.target.value) })
                }
              />
              {runToError && <FieldError>{runToError}</FieldError>}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="p-best">Best progress %</FieldLabel>
              <Input
                id="p-best"
                inputMode="numeric"
                value={draft.percentage}
                onChange={(e) =>
                  patchDraft({ percentage: digitsOnly(e.target.value) })
                }
              />
              {percentageError && <FieldError>{percentageError}</FieldError>}
            </div>
            <div>
              <FieldLabel htmlFor="p-date">Date</FieldLabel>
              <Input
                id="p-date"
                type="date"
                value={draft.date ?? ''}
                onChange={(e) => patchDraft({ date: e.target.value || null })}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fromRun && (
            <div>
              <FieldLabel htmlFor="p-date2">Date</FieldLabel>
              <Input
                id="p-date2"
                type="date"
                value={draft.date ?? ''}
                onChange={(e) => patchDraft({ date: e.target.value || null })}
              />
            </div>
          )}
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