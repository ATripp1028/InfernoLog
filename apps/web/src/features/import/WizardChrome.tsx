// The wizard's small shared chrome: the step breadcrumb, the collapsible
// parse-flag list, and the commit progress bar. Everything here is
// presentational; the step ordering it reads from lives in importWizardModel.

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ParseFlag } from './parseSpreadsheet'
import { STEP_ORDER, type WizardStep } from './importWizardModel'

export function StepIndicator({
  step,
  skipConflictCheck,
}: {
  step: WizardStep
  skipConflictCheck?: boolean
}) {
  const steps: { id: WizardStep | 'done'; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'review', label: 'Review' },
    ...(skipConflictCheck
      ? []
      : [
          { id: 'resolve-conflicts' as const, label: 'Conflicts' },
          { id: 'resolve-lists' as const, label: 'Lists' },
        ]),
    { id: 'committing', label: 'Import' },
    { id: 'success', label: 'Done' },
  ]

  // checking-conflicts shares the "Conflicts" slot with resolve-conflicts
  // itself — it's the in-flight check that decides whether the resolve step
  // is needed at all, so it must render as the same indicator position
  // rather than briefly flashing "Import" as current before possibly
  // stepping back. resolve-lists gets its own slot: it's reachable either
  // directly from checking-conflicts (no field conflicts, but a list merge
  // is needed) or after resolve-conflicts finishes — both are forward moves
  // since its order (3) is greater than checking-conflicts/resolve-conflicts's (2).
  const current = STEP_ORDER[step]

  return (
    <ol className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
      {steps.map(({ id, label }, i) => (
        <li key={id} className="flex items-center gap-2">
          {i > 0 && <span className="text-muted-foreground/40">›</span>}
          <span
            className={cn(
              STEP_ORDER[id] === current && 'font-semibold text-foreground',
              STEP_ORDER[id] < current &&
                'text-muted-foreground/60 line-through'
            )}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function FlagList({
  flags,
  limit = 10,
}: {
  flags: ParseFlag[]
  limit?: number
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? flags : flags.slice(0, limit)

  if (!flags.length) return null
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {shown.map((f) => (
        <li
          key={`${f.rowIndex}-${f.field}`}
          className={
            f.severity === 'warning'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-[var(--color-danger)]'
          }
        >
          {f.rowLabel} · {f.field} — {f.message}
        </li>
      ))}
      {flags.length > limit && !showAll && (
        <li>
          <button
            className="underline text-muted-foreground"
            onClick={() => setShowAll(true)}
          >
            +{flags.length - limit} more
          </button>
        </li>
      )}
    </ul>
  )
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  )
}
