// The slider + stepper pair every rating and enjoyment field is edited with.
// The logging flow and the level-page edit modals each had a copy; they had
// drifted in label width, vertical padding, and slider step, and — the trap —
// one spoke internal 0–100 while the other spoke display units.

import { Slider } from '@/components/ui/slider'
import { StepperInput } from '@/components/ui/stepper-input'
import { displayMax } from '@/lib/ratingScale'
import type { RatingDisplayScale } from '@/lib/api/wireEnums'

/**
 * One labelled rating control: a slider and a stepper editing the same value.
 *
 * **Values are in DISPLAY units** — 0–10 or 0–100 depending on `scale`, not
 * the internal 0–100 everything is stored as. Callers holding internal values
 * convert at the boundary with `toDisplay`/`toInternal` from
 * `lib/ratingScale`, so the unit is visible at the call site rather than
 * hidden in here.
 *
 * @param value - `null` renders as 0 without claiming the user chose 0.
 * @param sliderStep - Display units per slider notch. Defaults to a whole
 * unit; the edit modals pass a tenth on the 0–10 scale, which is the finest
 * the internal integer scale can represent.
 * @param labelWidth - Tailwind width for the label column at `sm` and up.
 */
export function RatingRow({
  label,
  sublabel,
  value,
  scale,
  onChange,
  sliderStep,
  labelWidth = 'sm:w-28',
}: {
  label: string
  sublabel?: string
  value: number | null
  scale: RatingDisplayScale
  onChange: (display: number) => void
  sliderStep?: number
  labelWidth?: string
}) {
  const max = displayMax(scale)
  const isTen = scale === 'ZERO_TO_TEN'
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
          step={sliderStep ?? 1}
          value={[display]}
          onValueChange={(vals) => onChange(vals[0] ?? 0)}
        />
        <StepperInput
          value={display}
          onChange={onChange}
          min={0}
          max={max}
          precision={isTen ? 1 : 0}
          deltas={isTen ? [0.5, 1] : [5, 10]}
          aria-label={label}
          className="w-full sm:w-auto"
          inputClassName="min-w-0 flex-1 sm:w-12 sm:flex-none"
        />
      </div>
    </div>
  )
}
