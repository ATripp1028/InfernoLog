import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  commitValue,
  formatDelta,
  formatValue,
  orderedDeltas,
  stepValue,
} from './stepperValue'

interface StepperInputProps {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  /** Number of decimal places used for rounding/clamping. Default 2. */
  precision?: number
  /** Buttons rendered on each side. Default [0.1, 0.01]. */
  deltas?: number[]
  className?: string
  inputClassName?: string
  'aria-label'?: string
}

/**
 * A controlled numeric input with explicit step buttons on either side.
 *
 * The native `<input type="number">` step widget only supports one increment
 * and forces decimal precision into the value at all times. This component:
 *   - keeps the field as a free-form string while focused so the user can
 *     clear it and type;
 *   - parses + clamps + rounds on blur (and on step-button click);
 *   - exposes any number of step deltas (e.g. 0.1 and 0.01) as flanking
 *     buttons rather than browser spinner chrome.
 */
export function StepperInput({
  value,
  onChange,
  min = 0,
  max = 1,
  precision = 2,
  deltas = [0.1, 0.01],
  className,
  inputClassName,
  'aria-label': ariaLabel,
}: StepperInputProps) {
  const bounds = { min, max, precision }
  const format = (n: number) => formatValue(n, precision)

  // String shown in the input. When the user focuses, we let them type
  // freely; only on blur do we parse/clamp/round and call onChange.
  const [draft, setDraft] = useState<string>(() => format(value))
  const focused = useRef(false)
  // Set by Escape so the blur it triggers reverts instead of committing.
  // `blur()` runs synchronously, so onBlur fires before React has re-rendered
  // the reverted draft and would otherwise read the pre-revert DOM value —
  // committing the very edit Escape just abandoned.
  const abandoned = useRef(false)

  // Keep the input synced with the prop when not actively being edited
  // (e.g. parent "Distribute equally" or "Sort by weight" changes the value).
  useEffect(() => {
    if (!focused.current) setDraft(format(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, precision])

  const apply = (next: number) => {
    setDraft(format(next))
    if (next !== value) onChange(next)
  }
  const commit = (raw: string) => apply(commitValue(raw, value, bounds))
  const step = (delta: number) => apply(stepValue(value, delta, bounds))

  return (
    <div
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-md border border-input bg-bg-surface shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
        className
      )}
    >
      {/* Negative deltas on the left, smallest delta closest to the input. */}
      {orderedDeltas(deltas, 'minus').map((d) => (
        <StepButton
          key={`minus-${d}`}
          label={`−${formatDelta(d)}`}
          onClick={() => step(-d)}
          disabled={value <= min}
        />
      ))}
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          focused.current = true
          // Select all so the user can immediately overwrite.
          e.currentTarget.select()
        }}
        onBlur={(e) => {
          focused.current = false
          if (abandoned.current) {
            abandoned.current = false
            setDraft(format(value))
            return
          }
          commit(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            abandoned.current = true
            setDraft(format(value))
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        aria-label={ariaLabel}
        className={cn(
          'w-16 border-x border-border-subtle bg-transparent px-2 text-center text-sm text-foreground placeholder:text-muted-foreground focus:outline-none',
          inputClassName
        )}
      />
      {/* Positive deltas on the right, smallest delta closest to the input. */}
      {orderedDeltas(deltas, 'plus').map((d) => (
        <StepButton
          key={`plus-${d}`}
          label={`+${formatDelta(d)}`}
          onClick={() => step(d)}
          disabled={value >= max}
        />
      ))}
    </div>
  )
}

interface StepButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
}

function StepButton({ label, onClick, disabled }: StepButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      className="flex w-10 shrink-0 items-center justify-center bg-bg-elevated text-xs font-medium text-muted-foreground transition-colors hover:bg-bg-subtle hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  )
}
