import { cn } from '@/lib/utils'

interface EscalationRowProps {
  /** Accent-coloured primary line — contextual per call site (see 2.7). */
  title: string
  /** Muted secondary line explaining the one-request cost + dedupe. */
  subtitle: string
  /**
   * Fires the opt-in escalation. Omitted → the row renders non-interactive
   * (Part 1 stub, before the GD-search endpoint exists). Every confirm is
   * explicit and independent — never a keystroke, never a mode.
   */
  onConfirm?: () => void
  /** Show the `↵ Enter` affordance (desktop only). */
  showEnterHint?: boolean
  compact?: boolean
}

// The accent-tinted "search GD's servers" offer. Visually distinct from a
// result row so escalating always reads as a deliberate, one-request action.
export function EscalationRow({
  title,
  subtitle,
  onConfirm,
  showEnterHint = false,
  compact = false,
}: EscalationRowProps) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-primary">{title}</span>
        <span className="mt-0.5 block text-[11px] text-text-secondary">
          {subtitle}
        </span>
      </span>
      {showEnterHint && onConfirm && (
        <span
          className="shrink-0 text-[11px] text-text-secondary"
          style={{ fontFamily: 'var(--font-mono)' }}
          aria-hidden
        >
          ↵ Enter
        </span>
      )}
    </>
  )

  const className = cn(
    'flex w-full items-center gap-3 bg-[rgba(232,57,14,0.08)] text-left',
    compact ? 'min-h-16 px-4 py-2' : 'h-14 px-5',
    onConfirm && 'transition-colors hover:bg-[rgba(232,57,14,0.14)]'
  )

  if (!onConfirm) {
    return <div className={className}>{inner}</div>
  }

  return (
    <button type="button" onClick={onConfirm} className={className}>
      {inner}
    </button>
  )
}
