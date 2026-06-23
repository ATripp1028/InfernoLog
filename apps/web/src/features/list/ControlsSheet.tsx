import { Switch } from '@/components/ui/switch'
import { SortChips } from './SortChips'
import { COLUMNS, type ColumnVisibility, type ColumnId } from './columns'
import type { SortSpec } from './types'

// Content for the mobile "Controls" bottom sheet: sort + column toggles, which
// live inline in the toolbar on larger screens.
export function ControlsSheet({
  sorts,
  onSorts,
  columns,
  onColumns,
}: {
  sorts: SortSpec[]
  onSorts: (s: SortSpec[]) => void
  columns: ColumnVisibility
  onColumns: (c: ColumnVisibility) => void
}) {
  function toggle(id: ColumnId) {
    onColumns({ ...columns, [id]: !columns[id] })
  }
  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-text-secondary">Sort</h3>
        <SortChips sorts={sorts} onChange={onSorts} />
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-text-secondary">Columns</h3>
        {COLUMNS.map((col) => (
          <label
            key={col.id}
            className="flex cursor-pointer items-center justify-between py-1.5 text-sm text-text-primary"
          >
            {col.label}
            <Switch
              checked={columns[col.id]}
              onCheckedChange={() => toggle(col.id)}
            />
          </label>
        ))}
      </section>
    </div>
  )
}
