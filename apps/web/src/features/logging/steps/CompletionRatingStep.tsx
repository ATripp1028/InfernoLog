import { Button } from '@/components/generic/button'
import { RatingRow } from '@/components/data/RatingRow'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '@/context/LoggingFlowContext'
import { LevelHeader, SectionLabel, StepBody, StepFooter } from '../components'
import {
  formatScore,
  formatWeightPercent,
  toScoreDisplay,
  toScoreInternal,
} from '@/lib/ratingScale'
import { computeOverallRating } from '@infernolog/core'
import { overallRatingConfig, ratingScoresFromDraft } from '@/lib/ratingConfig'
import { isEmptyOrNullObject } from '@/lib/utils'
import { useEffect } from 'react'

/**
 * Completion step 2: enjoyment, and a score per rating category.
 */
export function CompletionRatingStep() {
  const { level, draft, patchDraft, setStep } = useLoggingFlow()
  const me = useMe()
  useEffect(() => {
    if (!me.data) return
    if (isEmptyOrNullObject(draft.ratingScores)) {
      patchDraft({
        ratingScores: me.data.ratingCategories.reduce(
          (acc, cat) => ({ ...acc, [cat.id]: 50 }),
          {}
        ),
      })
    }
    if (!draft.enjoyment) {
      patchDraft({ enjoyment: 50 })
    }
  }, [draft.ratingScores, patchDraft, me.data, draft.enjoyment])
  if (!level || !me.data) return null

  const categories = me.data.ratingCategories

  // The same computation the save is scored by — enjoyment folded in when the
  // account opted into it, categories renormalized over whatever is filled in
  // so far. Anything less than the real thing is a number that changes on the
  // next screen.
  const overallRating = computeOverallRating(overallRatingConfig(me.data), {
    enjoyment: draft.enjoyment,
    ratingScores: ratingScoresFromDraft(draft.ratingScores),
  })

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />

        <div>
          <SectionLabel>Enjoyment</SectionLabel>
          <RatingRow
            label="Enjoyment Score"
            field="enjoyment"
            value={draft.enjoyment}
            onChange={(v) => patchDraft({ enjoyment: v })}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <SectionLabel>Rating</SectionLabel>
            {overallRating != null && (
              <span className="text-sm text-text-secondary">
                weighted avg:{' '}
                <span className="font-semibold text-current">
                  {formatScore(overallRating)}
                </span>
              </span>
            )}
          </div>

          {/* Reachable only for an account whose categories were all deleted
              between this form mounting and the config being saved — the
              settings editor will not save an empty list. */}
          {categories.length === 0 ? (
            <p className="text-sm text-text-tertiary">
              No rating categories configured. Add one in Settings to rate this
              completion.
            </p>
          ) : (
            categories.map((cat) => (
              <InternalScoreRow
                key={cat.id}
                label={cat.name}
                sublabel={`weight ${formatWeightPercent(cat.weight)}`}
                value={draft.ratingScores[cat.id] ?? null}
                onChange={(v) =>
                  patchDraft({
                    ratingScores: { ...draft.ratingScores, [cat.id]: v },
                  })
                }
              />
            ))
          )}
        </div>
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('c_basics')}>
          Back
        </Button>
        <Button onClick={() => setStep('c_session')}>Continue</Button>
      </StepFooter>
    </>
  )
}

/**
 * {@link RatingRow} for a SCORE held in internal 0–100 units, which is how the
 * logging draft stores every rating before it is submitted.
 *
 * Enjoyment has no wrapper of its own: it is shown on the same 0–100 scale it
 * is stored on, so it uses {@link RatingRow} directly.
 */
function InternalScoreRow({
  value,
  onChange,
  ...rest
}: Omit<React.ComponentProps<typeof RatingRow>, 'field' | 'labelWidth'>) {
  return (
    <RatingRow
      {...rest}
      field="score"
      value={value != null ? toScoreDisplay(value) : null}
      onChange={(display) => onChange(toScoreInternal(display))}
    />
  )
}
