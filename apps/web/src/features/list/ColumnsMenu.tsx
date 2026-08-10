import { ChevronDown } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/generic/popover'
import { Switch } from '@/components/generic/switch'
import type { ColumnDef, ColumnVisibility, ColumnId } from './columns'
import { COLUMNS } from './columns'
import { SectionLabel } from '@/components/inputs/SectionLabel'

/**
 * Column visibility and order for the List table.
 */
export function ColumnsMenu({
  columns,
  onChange,
  hideTime,
  onHideTime,
  allColumnDefs,
}: {
  columns: ColumnVisibility
  onChange: (next: ColumnVisibility) => void
  hideTime: boolean
  onHideTime: (next: boolean) => void
  allColumnDefs: ColumnDef[]
}) {
  function toggle(id: ColumnId) {
    onChange({ ...columns, [id]: !columns[id] })
  }

  const staticCols = COLUMNS
  const catCols = allColumnDefs.filter((c) => c.id.startsWith('cat:'))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated py-1.5 pl-3 pr-2.5 text-[13px] font-medium text-text-primary cursor-pointer"
        >
          Columns <ChevronDown size={12} className="text-text-secondary" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end">
        {staticCols.map((col) => (
          <label
            key={col.id}
            className="flex cursor-pointer items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-sm text-text-primary hover:bg-bg-subtle"
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
            <div className="mx-2 my-1 border-t border-border-subtle" />
            <SectionLabel size="xs" className="px-2 pb-1">
              Rating Categories
            </SectionLabel>
            {catCols.map((col) => (
              <label
                key={col.id}
                className="flex cursor-pointer items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-sm text-text-primary hover:bg-bg-subtle"
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
        <div className="mx-2 my-1 border-t border-border-subtle" />
        <SectionLabel size="xs" className="px-2 pb-1">
          Display
        </SectionLabel>
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-sm text-text-primary hover:bg-bg-subtle">
          Hide time
          <Switch checked={hideTime} onCheckedChange={onHideTime} />
        </label>
      </PopoverContent>
    </Popover>
  )
}
