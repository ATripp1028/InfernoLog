// The two input controls FilterPanel is built from: a dual-handle range
// slider with editable end boxes, and the From/To date pair. The date box
// itself is shared with the Log page's range and lives in
// components/inputs/DatePickerField; the slider's draft handling and clamping
// live in useFilterInputs.

import { RangeSlider } from '@/components/generic/range-slider'
import { DatePickerField } from '@/components/inputs/DatePickerField'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import type { DateBounds, Range } from '@/features/list/types'
import { useRangeDrafts } from './useFilterInputs'

const inputCls =
  'w-full rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] text-center text-text-primary outline-none focus:border-primary transition-colors'

/**
 * A labelled two-thumb range filter with numeric entry on both ends.
 */
export function RangeRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  trackClassName,
  trackStyle,
  parseInput,
}: {
  label: string
  min: number
  max: number
  step: number
  value: Range
  onChange: (v: Range) => void
  format: (v: number, end: 'min' | 'max') => string
  trackClassName?: string | undefined
  trackStyle?: React.CSSProperties | undefined
  parseInput?: ((text: string, end: 'min' | 'max') => number | null) | undefined
}) {
  const { minDraft, setMinDraft, commitMin, maxDraft, setMaxDraft, commitMax } =
    useRangeDrafts({ min, max, value, onChange, parseInput })

  return (
    <div className="flex flex-col gap-2 px-4 py-1.5">
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <RangeSlider
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={(v) => onChange([v[0]!, v[1]!])}
        trackClassName={trackClassName}
        trackStyle={trackStyle}
      />
      {parseInput ? (
        <div className="flex gap-1.5">
          <input
            className={inputCls}
            value={minDraft ?? format(value[0], 'min')}
            onChange={(e) => setMinDraft(e.target.value)}
            onBlur={(e) => commitMin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMin(e.currentTarget.value)
            }}
          />
          <input
            className={inputCls}
            value={maxDraft ?? format(value[1], 'max')}
            onChange={(e) => setMaxDraft(e.target.value)}
            onBlur={(e) => commitMax(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMax(e.currentTarget.value)
            }}
          />
        </div>
      ) : (
        <div className="flex justify-between text-[11px] text-text-tertiary">
          <span>{format(value[0], 'min')}</span>
          <span>{format(value[1], 'max')}</span>
        </div>
      )}
    </div>
  )
}

/**
 * The date-beaten bounds. Either end may be left open, so an unset upper bound never silently means 'today'.
 */
export function DatePickersRow({
  value,
  onChange,
  datePref,
  minDate,
  today,
}: {
  value: DateBounds
  onChange: (v: DateBounds) => void
  datePref: DateFormatPreference
  minDate: number
  // "Now" for the upper bound, passed in so the panel and its inputs agree.
  today: number
}) {
  return (
    <div className="flex gap-2 px-4 py-1.5">
      <DatePickerField
        label="From"
        value={value.from}
        onChange={(from) => onChange({ ...value, from })}
        datePref={datePref}
        min={minDate}
        max={value.to ?? today}
        placeholder="Any"
      />
      <DatePickerField
        label="To"
        value={value.to}
        onChange={(to) => onChange({ ...value, to })}
        datePref={datePref}
        min={value.from ?? minDate}
        max={today}
        placeholder="Today"
      />
    </div>
  )
}
