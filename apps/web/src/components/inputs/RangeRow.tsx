// A labelled two-thumb range control with numeric entry on both ends. Shared by
// the Log page's filter panel, which filters client-side and so commits as the
// thumbs move, and the /search filters, where every commit is a server query
// and so they pass commitOnRelease — and where a filter can be narrowed to one
// value (`single`). The draft, clamping, and drag handling live in
// useRangeDrafts.

import { RangeSlider } from '@/components/generic/range-slider'
import { cn } from '@/lib/utils'
import { useRangeDrafts, type Range } from './useRangeDrafts'

const inputCls =
  'w-full rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] text-center text-text-primary outline-none focus:border-primary transition-colors'

/**
 * A labelled two-thumb range filter with numeric entry on both ends.
 */
export function RangeRow({
  label,
  hideLabel = false,
  min,
  max,
  step = 1,
  value,
  onChange,
  format,
  trackClassName,
  trackStyle,
  parseInput,
  single = false,
  commitOnRelease = false,
  className,
}: {
  label: string
  /** Keep the label for screen readers only, for a caller rendering its own heading. */
  hideLabel?: boolean | undefined
  min: number
  max: number
  step?: number | undefined
  value: Range
  onChange: (v: Range) => void
  format: (v: number, end: 'min' | 'max') => string
  trackClassName?: string | undefined
  trackStyle?: React.CSSProperties | undefined
  parseInput?: ((text: string, end: 'min' | 'max') => number | null) | undefined
  /**
   * Draw one thumb and one value, for a filter narrowed to a single value.
   * `value` is then [v, v], and so is everything `onChange` reports.
   */
  single?: boolean | undefined
  /** Report a slider change once, when the thumb is let go, not on every step of the drag. */
  commitOnRelease?: boolean | undefined
  className?: string | undefined
}) {
  const {
    shown,
    slide,
    release,
    minDraft,
    setMinDraft,
    commitMin,
    maxDraft,
    setMaxDraft,
    commitMax,
    commitSingle,
  } = useRangeDrafts({ min, max, value, onChange, parseInput, commitOnRelease })

  return (
    <div className={cn('flex flex-col gap-2 px-4 py-1.5', className)}>
      <p
        className={
          hideLabel ? 'sr-only' : 'text-xs font-medium text-text-secondary'
        }
      >
        {label}
      </p>
      <RangeSlider
        min={min}
        max={max}
        step={step}
        value={single ? [shown[0]] : shown}
        onValueChange={slide}
        onValueCommit={release}
        trackClassName={trackClassName}
        trackStyle={trackStyle}
      />
      {parseInput ? (
        single ? (
          <input
            aria-label={label}
            className={inputCls}
            value={minDraft ?? format(shown[0], 'min')}
            onChange={(e) => setMinDraft(e.target.value)}
            onBlur={(e) => commitSingle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitSingle(e.currentTarget.value)
            }}
          />
        ) : (
          <div className="flex gap-1.5">
            <input
              aria-label={`${label} minimum`}
              className={inputCls}
              value={minDraft ?? format(shown[0], 'min')}
              onChange={(e) => setMinDraft(e.target.value)}
              onBlur={(e) => commitMin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitMin(e.currentTarget.value)
              }}
            />
            <input
              aria-label={`${label} maximum`}
              className={inputCls}
              value={maxDraft ?? format(shown[1], 'max')}
              onChange={(e) => setMaxDraft(e.target.value)}
              onBlur={(e) => commitMax(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitMax(e.currentTarget.value)
              }}
            />
          </div>
        )
      ) : single ? (
        <p className="text-center text-[11px] font-medium text-text-secondary">
          {format(shown[0], 'min')}
        </p>
      ) : (
        <div className="flex justify-between text-[11px] text-text-tertiary">
          <span>{format(shown[0], 'min')}</span>
          <span>{format(shown[1], 'max')}</span>
        </div>
      )}
    </div>
  )
}
