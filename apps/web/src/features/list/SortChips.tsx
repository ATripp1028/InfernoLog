import { DndContext, type DragEndEvent, closestCenter } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from 'lucide-react'
import { useSortableSensors } from '@/features/settings/hooks/useSortableSensors'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { SORT_LABEL, SORT_OPTIONS, defaultDir } from './sortMeta'
import type { SortKey, SortSpec } from './types'

interface SortChipsProps {
  sorts: SortSpec[]
  onChange: (sorts: SortSpec[]) => void
}

function Chip({
  spec,
  onToggleDir,
  onRemove,
}: {
  spec: SortSpec
  onToggleDir: () => void
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: spec.key })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] py-1.5 pl-2 pr-2 text-xs',
        isDragging && 'opacity-60'
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-text-tertiary active:cursor-grabbing"
        aria-label="Reorder sort"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={12} />
      </button>
      <button
        type="button"
        onClick={onToggleDir}
        className="flex items-center gap-1 font-medium text-text-primary"
      >
        {SORT_LABEL[spec.key]}
        {spec.dir === 'asc' ? (
          <ArrowUp size={12} className="text-success" />
        ) : (
          <ArrowDown size={12} className="text-primary" />
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${SORT_LABEL[spec.key]} sort`}
        className="text-text-secondary hover:text-text-primary"
      >
        <X size={12} />
      </button>
    </div>
  )
}

export function SortChips({ sorts, onChange }: SortChipsProps) {
  const sensors = useSortableSensors()
  const activeKeys = new Set(sorts.map((s) => s.key))
  const available = SORT_OPTIONS.filter((o) => !activeKeys.has(o.key))

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = sorts.findIndex((s) => s.key === active.id)
    const to = sorts.findIndex((s) => s.key === over.id)
    if (from < 0 || to < 0) return
    onChange(arrayMove(sorts, from, to))
  }

  function toggleDir(key: SortKey) {
    onChange(
      sorts.map((s) =>
        s.key === key ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : s
      )
    )
  }

  function remove(key: SortKey) {
    onChange(sorts.filter((s) => s.key !== key))
  }

  function add(key: SortKey) {
    onChange([...sorts, { key, dir: defaultDir(key) }])
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sorts.map((s) => s.key)}
          strategy={horizontalListSortingStrategy}
        >
          {sorts.map((spec) => (
            <Chip
              key={spec.key}
              spec={spec}
              onToggleDir={() => toggleDir(spec.key)}
              onRemove={() => remove(spec.key)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {available.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border)] px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary"
            >
              <Plus size={12} /> Sort
            </button>
          </PopoverTrigger>
          <PopoverContent align="start">
            {available.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => add(o.key)}
                className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-text-primary hover:bg-[var(--color-bg-subtle)]"
              >
                {o.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
