import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  useResolveImportRow,
  useResolveAllImportRows,
  type ImportStatusResponse,
} from '@/lib/api/import'

interface ImportStatusPanelProps {
  status: ImportStatusResponse
}

// The "X rows need review" expandable list + per-row resolve + "mark all
// resolved" bulk action. Shared: this is both the section the live Done
// screen gains when the job has flagged rows, and the standalone view opened
// from the persistent toast / Settings subline — same data, same component.
export function ImportStatusPanel({ status }: ImportStatusPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const resolveRow = useResolveImportRow()
  const resolveAll = useResolveAllImportRows()

  if (status.flaggedRows.length === 0) return null

  const unresolved = status.flaggedRows.filter((r) => !r.resolved)

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 text-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 font-medium text-amber-700 dark:text-amber-400"
      >
        <span>
          {unresolved.length > 0
            ? `${unresolved.length} row${unresolved.length !== 1 ? 's' : ''} need review`
            : 'All flagged rows resolved'}
        </span>
        <span aria-hidden>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-amber-500/40">
          <div className="flex justify-end px-3 py-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={unresolved.length === 0 || resolveAll.isPending}
              onClick={() => resolveAll.mutate()}
            >
              Mark all resolved
            </Button>
          </div>
          <div className="max-h-64 divide-y divide-[var(--color-border)] overflow-y-auto text-xs">
            {status.flaggedRows.map((row) => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">
                    {row.levelName ?? row.identifier ?? `Row ${row.rowIndex + 1}`}
                  </div>
                  <div className="text-muted-foreground">{row.issueMessage}</div>
                </div>
                {row.resolved ? (
                  <span className="shrink-0 text-muted-foreground">Resolved</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={resolveRow.isPending}
                    onClick={() => resolveRow.mutate(row.id)}
                  >
                    Resolve
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
