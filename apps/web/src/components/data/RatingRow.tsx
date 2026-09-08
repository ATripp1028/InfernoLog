// The slider + stepper pair every rating and enjoyment field is edited with.
// The logging flow and the level-page edit modals each had a copy; they had
// drifted in label width, vertical padding, and slider step, and — the trap —
// one spoke internal 0–100 while the other spoke display units.

import { Slider } from '@/components/generic/slider'
import { StepperInput } from '@/components/generic/stepper-input'
import { ENJOYMENT_MAX, SCORE_MAX } from '@/lib/ratingScale'

/** How a field is scaled, stepped and stepped-by. See `lib/ratingScale`. */
const FIELD_SHAPE: Record<
  'score' | 'enjoyment',
  { max: number; step: number; precision: number; deltas: number[] }
> = {
  // 0.1 is the finest notch the internal integer scale can represent.
  score: { max: SCORE_MAX, step: 0.1, precision: 1, deltas: [0.5, 1] },
  enjoyment: { max: ENJOYMENT_MAX, step: 1, precision: 0, deltas: [5, 10] },
}

/**
 * One labelled rating control: a slider and a stepper editing the same value.
 *
 * **Values are in DISPLAY units.** For `field="score"` that is 0–10, not the
 * internal 0–100 scores are stored as — callers convert at the boundary with
 * `toScoreDisplay`/`toScoreInternal` from `lib/ratingScale`, so the unit is
 * visible at the call site rather than hidden in here. For `field="enjoyment"`
 * the two units coincide at 0–100 and there is nothing to convert.
 *
 * @param field - Which scale this control edits on. See `lib/ratingScale`.
 * @param value - `null` renders as 0 without claiming the user chose 0.
 * @param labelWidth - Tailwind width for the label column at `sm` and up.
 */
export function RatingRow({
  label,
  sublabel,
  value,
  field,
  onChange,
  labelWidth = 'sm:w-28',
}: {
  label: string
  sublabel?: string
  value: number | null
  field: 'score' | 'enjoyment'
  onChange: (display: number) => void
  labelWidth?: string
}) {
  const { max, step, precision, deltas } = FIELD_SHAPE[field]
  const display = value ?? 0
  return (
    // Mobile: label above a full-width slider+stepper row, so the slider isn't
    // squeezed. Desktop (sm+): label | slider | stepper on one line — the
    // `sm:contents` wrapper dissolves so the slider and stepper rejoin the
    // outer flex row.
    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:gap-4">
      <div
        className={`flex items-baseline justify-between gap-2 sm:block sm:shrink-0 ${labelWidth}`}
      >
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {sublabel && <p className="text-xs text-text-tertiary">{sublabel}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:contents">
        {/* The slider moves in whole notches; the stepper buttons jump by
            larger amounts while its text field still accepts any value. Both
            edit the same number. */}
        <Slider
          className="w-full sm:flex-1"
          min={0}
          max={max}
          step={step}
          value={[display]}
          onValueChange={(vals) => onChange(vals[0] ?? 0)}
        />
        <StepperInput
          value={display}
          onChange={onChange}
          min={0}
          max={max}
          precision={precision}
          deltas={deltas}
          aria-label={label}
          className="w-full sm:w-auto"
          inputClassName="min-w-0 flex-1 sm:w-12 sm:flex-none"
        />
      </div>
    </div>
  )
}
