import { Button } from '@/components/generic/button'
import { RatingRow } from '@/components/data/RatingRow'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '../LoggingFlowProvider'
import { LevelHeader, SectionLabel, StepBody, StepFooter } from '../components'
import { formatRating, toDisplay, toInternal } from '@/lib/ratingScale'
import { computeWeightedAvg } from '@/utils/weightHandling'
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
          patchDraft({ ratingScores: me.data.ratingCategories.reduce((acc, cat) => ({ ...acc, [cat.id]: 50 }), {}) })
        }
        break
      default:
        console.error(`Unknown rating mode: ${me.data.ratingMode}`)
    }
    if (!draft.enjoyment) {
      patchDraft({ enjoyment: 50 })
    }
  }, [draft.ratingScores, patchDraft, me.data, draft.enjoyment, draft.simpleRating])
  if (!level || !me.data) return null

  const scale = me.data.ratingDisplayScale
  const weighted = me.data.ratingMode === 'WEIGHTED'
  const categories = me.data.ratingCategories

  const weightedAvg = weighted
    ? computeWeightedAvg(categories, draft.ratingScores)
    : null

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />

        <div>
          <SectionLabel>Enjoyment</SectionLabel>
          <InternalRatingRow
            label="Enjoyment Score"
            value={draft.enjoyment}
            scale={scale}
            onChange={(v) => patchDraft({ enjoyment: v })}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <SectionLabel>Rating{weighted ? ' · weighted' : ''}</SectionLabel>
            {weightedAvg != null && (
              <span className="text-sm text-text-secondary">
                weighted avg:{' '}
                <span className="font-semibold text-current">
                  {formatRating(weightedAvg, scale)}
                </span>
              </span>
            )}
          </div>

          {weighted ? (
            categories.length === 0 ? (
              <p className="text-sm text-text-tertiary">
                No rating categories configured. Add some in Settings to rate by
                category.
              </p>
            ) : (
              categories.map((cat) => (
                <InternalRatingRow
                  key={cat.id}
                  label={cat.name}
                  sublabel={`weight ${Math.round(cat.weight * 100)}%`}
                  value={draft.ratingScores[cat.id] ?? null}
                  scale={scale}
                  onChange={(v) =>
                    patchDraft({
                      ratingScores: { ...draft.ratingScores, [cat.id]: v },
                    })
                  }
                />
              ))
            )
          ) : (
            <InternalRatingRow
              label="Rating Score"
              value={draft.simpleRating}
              scale={scale}
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
 * {@link RatingRow} for a draft field held in internal 0–100 units, which is
 * how the logging draft stores every rating before it is submitted.
 */
function InternalRatingRow({
  value,
  scale,
  onChange,
  ...rest
}: Omit<React.ComponentProps<typeof RatingRow>, 'sliderStep' | 'labelWidth'>) {
  return (
    <RatingRow
      {...rest}
      scale={scale}
      value={value != null ? toDisplay(value, scale) : null}
      onChange={(display) => onChange(toInternal(display, scale))}
    />
  )
}
