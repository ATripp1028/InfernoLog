// The centred "nothing here yet" panel. The list, ranking, and collection
// pages each had their own, differing only in text and — accidentally — in
// which of two card treatments they used.

import { cn } from '@/lib/utils'

/**
 * A centred empty-state panel.
 *
 * @param variant - `card` is the ordinary surface panel; `dashed` is the
 * drop-target look, for an empty container the user is expected to fill (a
 * new collection), not merely one with nothing in it yet.
 * @param action - Rendered under the description. Omit when there is no
 * single obvious next step — the list and ranking pages point at the FAB in
 * prose instead, since the FAB is always on screen.
 */
export function EmptyState({
  title,
  description,
  action,
  variant = 'card',
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  variant?: 'card' | 'dashed'
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-card text-center',
        variant === 'card'
          ? 'border border-border-subtle bg-bg-surface p-10'
          : 'flex flex-col items-center justify-center border-2 border-dashed border-border py-16',
        className
      )}
    >
      <p
        className={cn(
          variant === 'dashed'
            ? 'text-base font-semibold text-text-primary'
            : 'text-text-primary'
        )}
      >
        {title}
      </p>
      {description && (
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
