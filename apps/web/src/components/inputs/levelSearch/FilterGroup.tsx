/**
 * One filter's block in the /search panel: a small uppercase label, an optional
 * control at the label's far end (a range filter's Range/Exact switch), and the
 * filter itself. The label row keeps the switch's height either way, so groups
 * with and without one line up across the grid.
 */
export function FilterGroup({
  label,
  action,
  className,
  children,
}: {
  label: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
          {label}
        </p>
        {action}
      </div>
      {children}
    </div>
  )
}
