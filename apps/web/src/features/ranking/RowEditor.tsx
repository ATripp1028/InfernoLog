import { Check, X } from 'lucide-react'
import { StepperInput } from '@/components/generic/stepper-input'
import { ratingColor } from '@/lib/ratingColor'
import { displayMax, formatRating } from '@/lib/ratingScale'
import { useRowEditor } from './useRowEditor'
import type { RatingCategory } from '@/lib/api/me'
import type { RatingDisplayScale } from '@/lib/api/wireEnums'
import type { RatingEdit } from '@/lib/api/ranking'
import type { OverallRatingConfig } from '@infernolog/core'

interface RowEditorProps {
  levelId: string
  scale: RatingDisplayScale
  config: OverallRatingConfig
  categories: RatingCategory[]
  overallRating: number | null
  ratingScores: readonly { categoryId: string; score: number }[]
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
 */
export function RowEditor({
  levelId,
  scale,
  config,
  categories,
  overallRating,
  ratingScores,
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
      className="flex flex-wrap items-end gap-x-4 gap-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(edit)
      }}
    >
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

      {/* Weighted mode hides its own arithmetic, so the figure that decides the
          row's position is spelled out rather than left to be inferred. */}
      {isWeighted && (
        <Field label="Overall">
          <span
            className="flex h-9 items-center text-lg font-semibold tabular-nums text-text-primary"
            style={{ color: ratingColor(preview) }}
          >
            {preview == null ? '—' : formatRating(preview, scale)}
          </span>
        </Field>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-subtle hover:text-text-primary"
          aria-label="Cancel"
          title="Cancel"
        >
          <X size={16} />
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex size-8 items-center justify-center rounded-md bg-primary text-text-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
          aria-label="Save rating"
          title="Save rating"
        >
          <Check size={16} />
        </button>
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
