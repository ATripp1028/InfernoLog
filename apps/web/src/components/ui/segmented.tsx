import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>
  value: T | null
  onChange: (value: T) => void
  className?: string
  /** Per-button minimum width helper; defaults to flex-1 equal widths. */
  fill?: boolean
}

// A row of mutually-exclusive pill buttons (Figma: difficulty opinion, manual
// in-game difficulty, From 0% / From a run). The selected option uses the
// primary fill; the rest are subtle outlined chips.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  fill = true,
}: SegmentedProps<T>) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'h-9 rounded-md border px-4 text-sm font-medium transition-colors',
              fill && 'flex-1',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-[var(--color-border)] bg-[var(--color-bg-surface)] text-text-secondary hover:text-text-primary hover:border-[var(--color-border)]/80'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
