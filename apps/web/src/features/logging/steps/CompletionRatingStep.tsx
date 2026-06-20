import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useMe, type RatingCategory } from '@/lib/api/me'
import type { RatingDisplayScale } from '@/lib/api/me'
import { useLoggingFlow } from '../LoggingFlowProvider'
import { LevelHeader, SectionLabel, StepBody, StepFooter } from '../components'
import { displayMax, formatRating, toDisplay, toInternal } from '../format'

export function CompletionRatingStep() {
  const { level, draft, patchDraft, setStep } = useLoggingFlow()
  const me = useMe()
  if (!level || !me.data) return null

  const scale = me.data.ratingDisplayScale
  const weighted = me.data.ratingMode === 'WEIGHTED'
  const categories = me.data.ratingCategories

  const weightedAvg = weighted ? computeWeightedAvg(categories, draft.ratingScores) : null

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />

        <div>
          <SectionLabel>Enjoyment</SectionLabel>
          <RatingRow
            label="Score"
            value={draft.enjoyment}
            scale={scale}
            onChange={(v) => patchDraft({ enjoyment: v })}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <SectionLabel>
              Rating{weighted ? ' · weighted' : ''}
            </SectionLabel>
            {weightedAvg != null && (
              <span className="text-sm text-text-secondary">
                weighted avg{' '}
                <span className="font-semibold text-accent">
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
                <RatingRow
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
            <RatingRow
              label="Score"
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
        <Button onClick={() => setStep('c_listrefs')}>Continue</Button>
      </StepFooter>
    </>
  )
}

function computeWeightedAvg(
  categories: RatingCategory[],
  scores: Record<string, number>
): number | null {
  let weightSum = 0
  let weighted = 0
  for (const cat of categories) {
    const score = scores[cat.id]
    if (score == null) continue
    weightSum += cat.weight
    weighted += score * cat.weight
  }
  if (weightSum === 0) return null
  return weighted / weightSum
}

function RatingRow({
  label,
  sublabel,
  value,
  scale,
  onChange,
}: {
  label: string
  sublabel?: string
  value: number | null
  scale: RatingDisplayScale
  onChange: (internal: number) => void
}) {
  const max = displayMax(scale)
  const display = value != null ? toDisplay(value, scale) : 0
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="w-28 shrink-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {sublabel && <p className="text-xs text-text-tertiary">{sublabel}</p>}
      </div>
      <Slider
        className="flex-1"
        min={0}
        max={max}
        step={1}
        value={[display]}
        onValueChange={(vals) => onChange(toInternal(vals[0] ?? 0, scale))}
      />
      <span
        className={
          'w-8 text-right font-mono text-sm ' +
          (value != null ? 'text-text-primary' : 'text-text-tertiary')
        }
      >
        {value != null ? formatRating(value, scale) : '—'}
      </span>
    </div>
  )
}
