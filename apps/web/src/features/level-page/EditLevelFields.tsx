import { Input } from '@/components/generic/input'
import { Label } from '@/components/generic/label'
import { Switch } from '@/components/generic/switch'
import { FieldError } from '@/components/generic/field-error'
import { clampPercent, digitsOnly } from '@/features/logging/format'
import { formatDisplayRating } from '@/lib/ratingScale'
import type { RatingDisplayScale } from '@/lib/api/wireEnums'
import { DateTimeField } from '@/features/logging/components'
import {
  Section,
  FieldLabel,
  Textarea,
  RatingRow,
  CoinPicker,
} from './EditShared'
import type { EditLevelFormState } from './useEditLevelModal'

/**
 * The LevelProgress-scoped fields — the ones with one value per level rather
 * than per logged event. Rendered on its own by EditLevelModal and as the
 * "Level" tab of EditEntryModal, so the two can never drift.
 */
export function EditLevelFields({
  state,
  scale,
  idPrefix = 'el',
}: {
  state: EditLevelFormState
  scale: RatingDisplayScale
  /** Namespaces the field ids, so two forms can coexist in one dialog. */
  idPrefix?: string
}) {
  const {
    form,
    patch,
    weighted,
    categories,
    weightedAvg,
    isCompleted,
    hasCoins,
    suggestedGddlTier,
    hasWorstFailAnchor,
    gddlTierError,
    level,
  } = state
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <>
      <Section label="Worst fail">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor={id('worstfail')}>Worst fail %</FieldLabel>
            <Input
              id={id('worstfail')}
              inputMode="numeric"
              placeholder="—"
              value={form.worstFail}
              onChange={(e) =>
                patch({ worstFail: clampPercent(e.target.value) })
              }
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <Label
              htmlFor={id('worstfaildate')}
              className="text-sm text-text-secondary"
            >
              Worst fail date
            </Label>
            {hasWorstFailAnchor && (
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={form.worstFailSameDay}
                  onChange={(e) =>
                    patch({ worstFailSameDay: e.target.checked })
                  }
                  className="rounded border-border"
                />
                Same day as {isCompleted ? 'completion' : 'drop'}
              </label>
            )}
          </div>
          {!form.worstFailSameDay && (
            <DateTimeField
              dateId={id('worstfaildate')}
              dateValue={form.worstFailDate}
              timeValue={form.worstFailTime}
              timezoneValue={form.worstFailTimezone}
              onDateChange={(v) => patch({ worstFailDate: v })}
              onTimeChange={(v) => patch({ worstFailTime: v })}
              onTimezoneChange={(v) => patch({ worstFailTimezone: v })}
            />
          )}
        </div>
      </Section>

      {isCompleted && hasCoins && (
        <Section label="Coins">
          <CoinPicker
            level={level}
            collected={form.coinsCollected}
            onChange={(v) => patch({ coinsCollected: v })}
          />
        </Section>
      )}

      <Section label="Rating">
        {weighted ? (
          categories.length === 0 ? (
            <p className="text-sm text-text-tertiary">
              No rating categories configured. Add some in Settings to rate by
              category.
            </p>
          ) : (
            <>
              {categories.map((cat) => (
                <RatingRow
                  key={cat.id}
                  label={cat.name}
                  sublabel={`weight ${Math.round(cat.weight * 100)}%`}
                  value={form.ratingScores[cat.id] ?? null}
                  scale={scale}
                  onChange={(v) =>
                    patch({
                      ratingScores: { ...form.ratingScores, [cat.id]: v },
                    })
                  }
                />
              ))}
              {weightedAvg != null && (
                <p className="text-right text-xs text-text-tertiary">
                  Weighted avg:{' '}
                  <span className="font-medium text-text-secondary">
                    {formatDisplayRating(weightedAvg)}
                  </span>
                </p>
              )}
            </>
          )
        ) : (
          <RatingRow
            label="Score"
            value={form.simpleRating}
            scale={scale}
            onChange={(v) => patch({ simpleRating: v })}
          />
        )}
      </Section>

      {isCompleted && (
        <Section label="GDDL">
          <div>
            <FieldLabel htmlFor={id('gddl-tier')}>Your tier opinion</FieldLabel>
            <Input
              id={id('gddl-tier')}
              inputMode="numeric"
              placeholder={
                suggestedGddlTier != null
                  ? `Community: ${suggestedGddlTier}`
                  : '—'
              }
              value={form.userGddlTier}
              onChange={(e) =>
                patch({ userGddlTier: digitsOnly(e.target.value) })
              }
            />
            {gddlTierError && <FieldError>{gddlTierError}</FieldError>}
          </div>
        </Section>
      )}

      <Section label="Notes">
        <div>
          <FieldLabel htmlFor={id('levelnotes')}>About this level</FieldLabel>
          <Textarea
            id={id('levelnotes')}
            placeholder="Your thoughts on this level overall…"
            value={form.levelNotes}
            onChange={(e) => patch({ levelNotes: e.target.value })}
            maxLength={5000}
          />
        </div>
      </Section>

      <Section label="Privacy">
        <div className="flex items-center justify-between rounded-card border border-border-subtle bg-bg-elevated/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">
              Private entry
            </p>
            <p className="text-xs text-text-tertiary">
              Only you can see this level on your profile.
            </p>
          </div>
          <Switch
            checked={form.visibility === 'PRIVATE'}
            onCheckedChange={(v) =>
              patch({ visibility: v ? 'PRIVATE' : 'PUBLIC' })
            }
          />
        </div>
      </Section>
    </>
  )
}
