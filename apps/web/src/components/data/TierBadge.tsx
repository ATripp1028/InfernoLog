import { cn } from '@/lib/utils'
import type { TierBadgeLook } from '@/lib/tierBadges'

/**
 * A community-list placement as a coloured chip — see lib/tierBadges for what
 * each list puts in it. An unpainted look falls back to the subtle surface
 * rather than to an invented colour.
 */
export function TierBadge({
  look,
  className,
}: {
  look: TierBadgeLook
  className?: string | undefined
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-8 items-center justify-center rounded px-2.5 py-1 text-xs font-bold',
        look.color ? undefined : 'bg-bg-subtle',
        className
      )}
      style={
        look.color
          ? { backgroundColor: look.color, color: look.textColor }
          : undefined
      }
    >
      {look.badge}
    </span>
  )
}

/**
 * Which of the two spreadsheets a sheet tier came from: listworthy (LW) or
 * non-listworthy (NLW). Derived from the tier number alone, and the only cue
 * that they are two lists.
 */
export function SheetSourceChip({ source }: { source: 'NLW' | 'LW' }) {
  return (
    <span
      className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary"
      title={
        source === 'LW'
          ? 'Listworthy spreadsheet'
          : 'Non-listworthy spreadsheet'
      }
    >
      {source}
    </span>
  )
}
