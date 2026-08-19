import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import { Card } from '@/components/generic/card'
import { Switch } from '@/components/generic/switch'
import { Label } from '@/components/generic/label'
import {
  DateTimeField,
  FieldError,
  FieldHint,
  FieldLabel,
  LevelHeader,
  StepBody,
  StepFooter,
} from '../components'
import { clampPercent, digitsOnly } from '../format'
import { GdVersionPicker, GdVersionInfoButton } from '../pickers'
import { useCompletionBasicsStep } from './useCompletionBasicsStep'
import { CoinsSection, TwoPlayerSection } from './CompletionBasicsFields'
import { DifficultyOpinionSelect } from '@/components/inputs/DifficultyOpinionSelect'

/**
 * Completion step 1: date, attempts, worst fail, coins, and 2-player.
 */
export function CompletionBasicsStep() {
  const {
    level,
    draft,
    patchDraft,
    setStep,
    showVersionPicker,
    attemptsError,
  } = useCompletionBasicsStep()

  if (!level) return null

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />

        {!level.isDemon && (
          <Card variant="accent" className="flex gap-3 p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                This isn&apos;t a demon
              </p>
              <p className="text-sm text-text-secondary">
                InfernoLog is built for demon tracking, so you&apos;ll see it
                framed that way in places. Everything still works — log it,
                rate it, rank it like any other completion.
              </p>
            </div>
          </Card>
        )}

        <div>
          <FieldLabel htmlFor="c-date">Date</FieldLabel>
          <DateTimeField
            dateId="c-date"
            dateValue={draft.date ?? ''}
            timeValue={draft.time}
            timezoneValue={draft.timezone}
            onDateChange={(v) => patchDraft({ date: v || null })}
            onTimeChange={(v) => patchDraft({ time: v })}
            onTimezoneChange={(v) => patchDraft({ timezone: v })}
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
            <Switch
              checked={draft.dateUncertain}
              onCheckedChange={(v) => patchDraft({ dateUncertain: v })}
            />
            Date is uncertain
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="c-attempts">Attempts</FieldLabel>
            <Input
              id="c-attempts"
              inputMode="numeric"
              value={draft.attempts}
              onChange={(e) =>
                patchDraft({ attempts: digitsOnly(e.target.value) })
              }
            />
            {attemptsError ? (
              <FieldError>{attemptsError}</FieldError>
            ) : (
              <FieldHint>Cumulative across all copies and reuploads.</FieldHint>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel
                htmlFor="c-worstfail"
                hint="Your best run from 0% before beating it."
              >
                Worst fail
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
              id="c-worstfail"
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
              Same day as completion
            </label>
            {!draft.worstFailSameDay && (
              <DateTimeField
                dateId="c-worstfaildate"
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

        <div>
          <FieldLabel hint="What you think it deserves — separate from the in-game rating.">
            Your difficulty opinion
          </FieldLabel>
          <DifficultyOpinionSelect
            value={draft.difficultyOpinion}
            onChange={(v) => patchDraft({ difficultyOpinion: v })}
          />
          <FieldHint>
            What you think it deserves — separate from the in-game rating shown
            above. Pick &quot;Not demon-worthy&quot; if you don&apos;t think it
            earns a demon face, then say what difficulty you&apos;d give it.
          </FieldHint>
        </div>

        {((level.coins ?? 0) > 0 || level.twoPlayer) && (
          <div
            className={cn(
              (level.coins ?? 0) > 0 && level.twoPlayer
                ? 'grid grid-cols-2 gap-5 items-start'
                : ''
            )}
          >
            {(level.coins ?? 0) > 0 && (
              <CoinsSection
                level={level}
                collected={draft.coinsCollected}
                onChange={(v) => patchDraft({ coinsCollected: v })}
              />
            )}
            {level.twoPlayer && (
              <TwoPlayerSection
                solo={draft.twoPlayerSolo}
                partner={draft.twoPlayerPartner}
                onSoloChange={(v) =>
                  patchDraft({ twoPlayerSolo: v, twoPlayerPartner: '' })
                }
                onPartnerChange={(v) => patchDraft({ twoPlayerPartner: v })}
              />
            )}
          </div>
        )}
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('find')}>
          Back
        </Button>
        <Button
          onClick={() => setStep('c_rating')}
          disabled={attemptsError != null}
        >
          Continue
        </Button>
      </StepFooter>
    </>
  )
}
