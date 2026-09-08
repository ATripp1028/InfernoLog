import { Button } from '@/components/generic/button'
import { RatingRow } from '@/components/data/RatingRow'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '@/context/LoggingFlowContext'
import { LevelHeader, SectionLabel, StepBody, StepFooter } from '../components'
import { formatScore, toScoreDisplay, toScoreInternal } from '@/lib/ratingScale'
import { computeOverallRating } from '@infernolog/core'
import { overallRatingConfig, ratingScoresFromDraft } from '@/lib/ratingConfig'
import { isEmptyOrNullObject } from '@/lib/utils'
import { useEffect } from 'react'

/**
 * Completion step 2: enjoyment and the rating, simple or per category.
 */
export function CompletionRatingStep() {
  const { level, draft, patchDraft, setStep } = useLoggingFlow()
  const me = useMe()
  useEffect(() => {
    if (!me.data) return
    switch (me.data.ratingMode) {
      case 'SIMPLE':
        if (!draft.simpleRating) {
          patchDraft({ simpleRating: 50 })
        }
        break
      case 'WEIGHTED':
        if (isEmptyOrNullObject(draft.ratingScores)) {
          patchDraft({
            ratingScores: me.data.ratingCategories.reduce(
              (acc, cat) => ({ ...acc, [cat.id]: 50 }),
              {}
            ),
          })
        }
        break
      case 'MANUAL':
        // Nothing to seed: there is no number in manual mode. The completion is
        // rated by being placed in the ranking, which happens afterwards.
        break
      default:
        console.error(`Unknown rating mode: ${me.data.ratingMode}`)
    }
    if (!draft.enjoyment) {
      patchDraft({ enjoyment: 50 })
    }
  }, [
    draft.ratingScores,
    patchDraft,
    me.data,
    draft.enjoyment,
    draft.simpleRating,
  ])
  if (!level || !me.data) return null

  const weighted = me.data.ratingMode === 'WEIGHTED'
  const manual = me.data.ratingMode === 'MANUAL'
  const categories = me.data.ratingCategories

  // The same computation the save is scored by — enjoyment folded in when the
  // account opted into it, categories renormalized over whatever is filled in
  // so far. Anything less than the real thing is a number that changes on the
  // next screen.
  const overallRating = weighted
    ? computeOverallRating(overallRatingConfig(me.data), {
        simpleRating: draft.simpleRating,
        enjoyment: draft.enjoyment,
        ratingScores: ratingScoresFromDraft(draft.ratingScores),
      })
    : null

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
            <SectionLabel>
              Rating{weighted ? ' · weighted' : manual ? ' · manual' : ''}
            </SectionLabel>
            {overallRating != null && (
              <span className="text-sm text-text-secondary">
                weighted avg:{' '}
                <span className="font-semibold text-current">
                  {formatScore(overallRating)}
                </span>
              </span>
            )}
          </div>

          {/* Manual mode has no score to type — the rating IS the position, and
              it is chosen on the Ranking page rather than here. Saying so beats
              showing a control whose value would be thrown away on save. */}
          {manual ? (
            <p className="text-sm text-text-tertiary">
              You rate by arranging your ranking, so there is no score to enter
              here. This completion will be waiting to be placed on the Ranking
              page once it is logged.
            </p>
          ) : weighted ? (
            categories.length === 0 ? (
              <p className="text-sm text-text-tertiary">
                No rating categories configured. Add some in Settings to rate by
                category.
              </p>
            ) : (
              categories.map((cat) => (
                <InternalScoreRow
                  key={cat.id}
                  label={cat.name}
                  sublabel={`weight ${Math.round(cat.weight * 100)}%`}
                  value={draft.ratingScores[cat.id] ?? null}
                  onChange={(v) =>
                    patchDraft({
                      ratingScores: { ...draft.ratingScores, [cat.id]: v },
                    })
                  }
                />
              ))
            )
          ) : (
            <InternalScoreRow
              label="Rating Score"
              value={draft.simpleRating}
              onChange={(v) => patchDraft({ simpleRating: v })}
            />
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
