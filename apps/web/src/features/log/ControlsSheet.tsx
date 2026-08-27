import { Switch } from '@/components/generic/switch'
import { SortChips } from './SortChips'
import type { ColumnDef, ColumnVisibility, ColumnId } from './columns'
import { COLUMNS } from './columns'
import type { SortKey, SortSpec } from './types'
import { SectionLabel } from '@/components/inputs/SectionLabel'

/**
 * Content for the mobile "Controls" bottom sheet: sort + column toggles, which
 * live inline in the toolbar on larger screens.
 */
export function ControlsSheet({
  sorts,
  onSorts,
  columns,
  onColumns,
  hideTime,
  onHideTime,
  allColumnDefs,
  categorySortOptions,
}: {
  sorts: SortSpec[]
  onSorts: (s: SortSpec[]) => void
  columns: ColumnVisibility
  onColumns: (c: ColumnVisibility) => void
  hideTime: boolean
  onHideTime: (next: boolean) => void
  allColumnDefs: ColumnDef[]
  categorySortOptions: { key: SortKey; label: string }[]
}) {
  function toggle(id: ColumnId) {
    onColumns({ ...columns, [id]: !columns[id] })
  }

  const catCols = allColumnDefs.filter((c) => c.id.startsWith('cat:'))

  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-text-secondary">Sort</h3>
        <SortChips
          sorts={sorts}
          onChange={onSorts}
          extraSortOptions={categorySortOptions}
        />
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
              checked={columns[col.id] ?? false}
              onCheckedChange={() => toggle(col.id)}
            />
          </label>
        ))}
        {catCols.length > 0 && (
          <>
            <SectionLabel size="xs" className="pt-2">
              Rating Categories
            </SectionLabel>
            {catCols.map((col) => (
              <label
                key={col.id}
                className="flex cursor-pointer items-center justify-between py-1.5 text-sm text-text-primary"
              >
                {col.label}
                <Switch
                  checked={columns[col.id] ?? false}
                  onCheckedChange={() => toggle(col.id)}
                />
              </label>
            ))}
          </>
        )}
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-text-secondary">Display</h3>
        <label className="flex cursor-pointer items-center justify-between py-1.5 text-sm text-text-primary">
          Hide time
          <Switch checked={hideTime} onCheckedChange={onHideTime} />
        </label>
      </section>
    </div>
  )
}
