import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '../LoggingFlowProvider'
import {
  FieldHint,
  FieldLabel,
  LevelHeader,
  StepBody,
  StepFooter,
} from '../components'
import { digitsOnly } from '../format'
import {
  GdVersionPicker,
  GdVersionInfoButton,
  isPreTwoTwo,
} from './CompletionSessionStep'

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
  const canContinue = fromRun
    ? draft.runFrom.trim() !== '' && draft.runTo.trim() !== ''
    : draft.percentage.trim() !== ''

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />

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
            <FieldLabel htmlFor="p-attempts">Attempts</FieldLabel>
            <Input
              id="p-attempts"
              inputMode="numeric"
              value={draft.attempts}
              onChange={(e) =>
                patchDraft({ attempts: digitsOnly(e.target.value) })
              }
            />
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

        <FieldHint>
          Cumulative across all copies and reuploads. Pick &quot;From a
          run&quot; to log a segment (e.g. 30% → 63%) instead of progress from
          the start.
        </FieldHint>
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
