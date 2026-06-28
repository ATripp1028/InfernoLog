import { ChevronDown } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { COLUMNS, type ColumnVisibility, type ColumnId } from './columns'

export function ColumnsMenu({
  columns,
  onChange,
}: {
  columns: ColumnVisibility
  onChange: (next: ColumnVisibility) => void
}) {
  function toggle(id: ColumnId) {
    onChange({ ...columns, [id]: !columns[id] })
  }
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
        {COLUMNS.map((col) => (
          <label
            key={col.id}
            className="flex cursor-pointer items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-sm text-text-primary hover:bg-[var(--color-bg-subtle)]"
          >
            {col.label}
            <Switch
              checked={columns[col.id]}
              onCheckedChange={() => toggle(col.id)}
            />
          </label>
        ))}
      </PopoverContent>
    </Popover>
  )
}
