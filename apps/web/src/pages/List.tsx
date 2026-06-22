import { useMemo, useState } from 'react'
import { useMe } from '../lib/api/me'
import { useMyProgress } from '../lib/api/list'
import { PageLoading } from '../components/PageLoading'
import { TooltipProvider } from '../components/ui/tooltip'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '../components/ui/sheet'
import { Toolbar } from '../features/list/Toolbar'
import { ListTable } from '../features/list/ListTable'
import { FilterPanel } from '../features/list/FilterPanel'
import { ControlsSheet } from '../features/list/ControlsSheet'
import {
  applyFilters,
  countActiveFilters,
  sortItems,
} from '../features/list/filtering'
import {
  defaultColumnVisibility,
  type ColumnVisibility,
} from '../features/list/columns'
import { defaultDir } from '../features/list/sortMeta'
import {
  defaultFilterState,
  type FilterState,
  type SortKey,
  type SortSpec,
} from '../features/list/types'

const DEFAULT_SORTS: SortSpec[] = [{ key: 'date', dir: 'desc' }]

export function List() {
  const me = useMe()
  const progress = useMyProgress()

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterState>(defaultFilterState)
  const [sorts, setSorts] = useState<SortSpec[]>(DEFAULT_SORTS)
  const [columns, setColumns] = useState<ColumnVisibility>(
    defaultColumnVisibility
  )
  const [filterOpen, setFilterOpen] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)

  const items = useMemo(() => progress.data ?? [], [progress.data])

  const visible = useMemo(
    () => sortItems(applyFilters(items, filters, search), sorts),
    [items, filters, search, sorts]
  )

  const activeFilterCount = countActiveFilters(filters)

  if (me.isPending || !me.data || progress.isPending) {
    return <PageLoading />
  }

  const { ratingDisplayScale, dateFormatPreference } = me.data

  function toggleSort(key: SortKey) {
    setSorts((prev) => {
      const existing = prev.find((s) => s.key === key)
      if (existing) {
        return prev.map((s) =>
          s.key === key ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : s
        )
      }
      return [...prev, { key, dir: defaultDir(key) }]
    })
  }

  function resetAll() {
    setSearch('')
    setFilters(defaultFilterState())
  }

  const canReset = search.trim() !== '' || activeFilterCount > 0

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-3 p-4 md:p-6">
        <h1 className="text-2xl font-semibold text-text-primary">My Demons</h1>

        <Toolbar
          search={search}
          onSearch={setSearch}
          sorts={sorts}
          onSorts={setSorts}
          columns={columns}
          onColumns={setColumns}
          activeFilterCount={activeFilterCount}
          onOpenFilters={() => setFilterOpen(true)}
          onOpenControls={() => setControlsOpen(true)}
          onReset={resetAll}
          canReset={canReset}
        />

        {items.length === 0 ? (
          <EmptyState />
        ) : visible.length === 0 ? (
          <NoMatches />
        ) : (
          <ListTable
            items={visible}
            columns={columns}
            sorts={sorts}
            onToggleSort={toggleSort}
            scale={ratingDisplayScale}
            datePref={dateFormatPreference}
          />
        )}
      </div>

      {/* Filter panel — slides in from the right on every breakpoint. */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="right" className="p-0">
          <SheetTitle className="sr-only">Filters</SheetTitle>
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            matchCount={visible.length}
            totalCount={items.length}
            scale={ratingDisplayScale}
            onClose={() => setFilterOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Mobile controls — sort + columns. */}
      <Sheet open={controlsOpen} onOpenChange={setControlsOpen}>
        <SheetContent side="bottom" className="p-0">
          <SheetTitle className="sr-only">Sort and columns</SheetTitle>
          <ControlsSheet
            sorts={sorts}
            onSorts={setSorts}
            columns={columns}
            onColumns={setColumns}
          />
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  )
}

function EmptyState() {
  return (
    <div className="rounded-card border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-10 text-center">
      <p className="text-text-primary">No levels logged yet.</p>
      <p className="mt-1 text-sm text-text-secondary">
        Log a completion or progress with the + button to start your list.
      </p>
    </div>
  )
}

function NoMatches() {
  return (
    <div className="rounded-card border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-10 text-center text-text-secondary">
      No levels match your filters.
    </div>
  )
}
