import { ChevronDown } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import type { ColumnDef, ColumnVisibility, ColumnId } from './columns'
import { COLUMNS } from './columns'

export function ColumnsMenu({
  columns,
  onChange,
  allColumnDefs,
}: {
  columns: ColumnVisibility
  onChange: (next: ColumnVisibility) => void
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
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1.5 pl-3 pr-2.5 text-[13px] font-medium text-text-primary cursor-pointer"
        >
          Columns <ChevronDown size={12} className="text-text-secondary" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end">
        {staticCols.map((col) => (
          <label
            key={col.id}
            className="flex cursor-pointer items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-sm text-text-primary hover:bg-[var(--color-bg-subtle)]"
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
            <div className="mx-2 my-1 border-t border-[var(--color-border-subtle)]" />
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
              Rating Categories
            </p>
            {catCols.map((col) => (
              <label
                key={col.id}
                className="flex cursor-pointer items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-sm text-text-primary hover:bg-[var(--color-bg-subtle)]"
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
      </PopoverContent>
    </Popover>
  )
}
