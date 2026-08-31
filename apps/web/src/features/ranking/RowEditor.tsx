import { Check, Loader2, X } from 'lucide-react'
import { StepperInput } from '@/components/generic/stepper-input'
import { ACTION_WIDTH, OVERALL_WIDTH } from './columns'
import { ratingRampColor } from '@/lib/ratingColor'
import { displayMax, formatRating } from '@/lib/ratingScale'
import { useRowEditor } from './useRowEditor'
import type { RatingCategory } from '@/lib/api/me'
import type { RatingDisplayScale } from '@/lib/api/wireEnums'
import type { RatingEdit } from '@/lib/api/ranking'
import type { OverallRatingConfig } from '@infernolog/core'

interface RowEditorProps {
  levelId: string
  /** The row's face/name/creator block, rendered by the row so both modes share it. */
  identity: React.ReactNode
  scale: RatingDisplayScale
  config: OverallRatingConfig
  categories: RatingCategory[]
  overallRating: number | null
  ratingScores: readonly { categoryId: string; score: number }[]
  /** The row's enjoyment, internal 0–100 — an input to the live preview. */
  enjoyment: number | null
  onSave: (edit: RatingEdit) => void
  onCancel: () => void
  saving: boolean
}

/**
 * The inline rating editor a row swaps into: one stepper in SIMPLE mode, one
 * per category in WEIGHTED, with the resulting overall rating shown live.
 *
 * Steppers rather than the sliders the edit modals use — a slider needs width
 * this row does not have, and the value being edited here is usually a nudge
 * to an existing score rather than a first pass.
 *
 * While a save is in flight the whole thing locks: the submit button becomes a
 * spinner and cancel is disabled, so the row cannot be abandoned or re-opened
 * between sending the change and learning whether it took.
 */
export function RowEditor({
  levelId,
  identity,
  scale,
  config,
  categories,
  overallRating,
  ratingScores,
  enjoyment,
  onSave,
  onCancel,
  saving,
}: RowEditorProps) {
  const { isWeighted, simple, setSimple, scores, setScore, preview, edit } =
    useRowEditor({
      levelId,
      scale,
      config,
      categories,
      overallRating,
      ratingScores,
      enjoyment,
    })

  const max = displayMax(scale)
  // Scores are stored as integers 0–100, so a tenth is the finest value the
  // 0–10 scale can actually hold and a whole number the finest on 0–100.
  // Offering anything finer would silently round on save — 5.55 becoming 5.6.
  const isTen = scale === 'ZERO_TO_TEN'
  const step = isTen ? [1, 0.1] : [10, 1]
  const precision = isTen ? 1 : 0

  return (
    <form
      className="relative z-10 flex flex-col gap-3 px-2 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(edit)
      }}
    >
      {/* The identity line, with the figure being edited alongside it: the
          overall rating is the outcome of every control below, so it belongs
          with the level it describes rather than at the end of a row of
          inputs. */}
      <div className="flex items-center gap-3">
        {identity}
        {/* WEIGHTED only: in SIMPLE mode the single stepper below IS the
            overall rating, and showing the same number twice explains
            nothing. */}
        {isWeighted && (
          <>
            {/* Sized and spaced like the row's own Overall cell, so the figure
                does not jump sideways when the editor opens — it stays in the
                column the header labels. */}
            <span
              title="Overall"
              className={`${OVERALL_WIDTH} shrink-0 text-center text-lg font-semibold tabular-nums text-text-primary`}
              style={{ color: ratingRampColor(preview) }}
            >
              {preview == null ? '—' : formatRating(preview, scale)}
            </span>
            <span className={`${ACTION_WIDTH} shrink-0`} aria-hidden />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        {isWeighted ? (
          categories.map((category) => (
            <Field key={category.id} label={category.name}>
              <StepperInput
                value={scores[category.id] ?? 0}
                onChange={(v) => setScore(category.id, v)}
                min={0}
                max={max}
                precision={precision}
                deltas={step}
                aria-label={`${category.name} score`}
              />
            </Field>
          ))
        ) : (
          <Field label="Rating">
            <StepperInput
              value={simple}
              onChange={setSimple}
              min={0}
              max={max}
              precision={precision}
              deltas={step}
              aria-label="Rating score"
            />
          </Field>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-subtle hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
            aria-label="Cancel"
            title="Cancel"
          >
            <X size={16} />
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex size-8 items-center justify-center rounded-md bg-primary text-text-primary transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-80"
            aria-label={saving ? 'Saving rating' : 'Save rating'}
            title={saving ? 'Saving…' : 'Save rating'}
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
          </button>
        </div>
      </div>
    </form>
  )
}

// A caption above a control, deliberately NOT a <label>: a stepper is an input
// plus four buttons, and a label wrapping all five associates with none of them
// usefully. Each control carries its own aria-label instead — which is why the
// captions read "Gameplay" while the inputs are "Gameplay score", so the two
// never collide when something looks a control up by name.
function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      {children}
    </div>
  )
}
