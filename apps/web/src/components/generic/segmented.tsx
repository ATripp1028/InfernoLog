import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * The pill-button styling every mutually-exclusive picker in the app shares.
 *
 * Exported for the handful of one-off buttons that are a segment in look but
 * not part of a {@link Segmented} group — `DifficultyOpinionSelect`'s "Not
 * demon-worthy" toggle is the reference case. Prefer {@link Segmented} itself
 * whenever the buttons form an actual option set; this used to be open-coded
 * in seven places and had already drifted into three sizes.
 */
export const segmentedItemVariants = cva(
  'rounded-md border font-medium transition-colors',
  {
    variants: {
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-9 px-4 text-sm',
        block: 'px-4 py-2.5 text-sm',
      },
      active: {
        true: 'border-primary bg-primary text-primary-foreground',
        false:
          'border-border bg-bg-surface/60 text-text-secondary hover:border-border/80 hover:text-text-primary',
      },
    },
    defaultVariants: { size: 'default', active: false },
  }
)

/** One choice in a {@link Segmented} group. */
export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedBaseProps<T extends string> extends Pick<
  VariantProps<typeof segmentedItemVariants>,
  'size'
> {
  options: ReadonlyArray<SegmentedOption<T>>
  value: T | null
  className?: string
  /** Per-button minimum width helper; defaults to flex-1 equal widths. */
  fill?: boolean
  /** Stack the buttons instead of laying them out in a row. */
  orientation?: 'horizontal' | 'vertical'
}

/**
 * `allowDeselect` widens `onChange` to emit `null`, so a caller backing a
 * required field never has to handle a case the group cannot produce.
 */
type SegmentedProps<T extends string> = SegmentedBaseProps<T> &
  (
    | { allowDeselect: true; onChange: (value: T | null) => void }
    | { allowDeselect?: false; onChange: (value: T) => void }
  )

/**
 * A group of mutually-exclusive pill buttons — difficulty opinion, device,
 * percentage version, 2-player, manual in-game difficulty.
 *
 * The selected option takes the primary fill; the rest are subtle outlined
 * chips. Clicking the active option is a no-op unless `allowDeselect` is set,
 * which only pickers backing a genuinely optional field (the device a run was
 * played on) should do.
 */
export function Segmented<T extends string>(props: SegmentedProps<T>) {
  const {
    options,
    value,
    className,
    fill = true,
    size,
    orientation = 'horizontal',
  } = props
  const allowDeselect = props.allowDeselect ?? false
  // One cast in place of branching the whole render: the prop union above is
  // what keeps callers honest, and `null` only reaches onChange when the
  // caller opted into the branch that accepts it.
  const emit = props.onChange as (value: T | null) => void

  return (
    <div
      className={cn(
        'flex gap-2',
        orientation === 'vertical' ? 'flex-col' : 'flex-wrap',
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => emit(active && allowDeselect ? null : opt.value)}
            className={cn(
              segmentedItemVariants({ size, active }),
              fill && orientation === 'horizontal' && 'flex-1'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
