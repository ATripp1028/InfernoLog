import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from '@/components/ui/sonner'
import { Card } from '@/components/ui/card'
import { ListSource, useUpdateListPriority, type MeData } from '@/lib/api/me'
import { DragHandle } from './DragHandle'
import { useSortableSensors } from '../hooks/useSortableSensors'

// OTHER is always last in priority — it's the catch-all when no list reference
// is available, so it doesn't make sense to surface it as a draggable option.
const VISIBLE_SOURCES: ListSource[] = ['GDDL', 'AREDL', 'POINTERCRATE', 'NLW']

const SOURCE_LABEL: Record<ListSource, string> = {
  GDDL: 'GDDL',
  AREDL: 'AREDL',
  POINTERCRATE: 'Pointercrate',
  NLW: 'NLW',
  OTHER: 'Other',
}

interface ListPriorityListProps {
  me: MeData
}

export function ListPriorityList({ me }: ListPriorityListProps) {
  const update = useUpdateListPriority()
  const sensors = useSortableSensors()

  // Render only the visible sources in the user's order; preserve any OTHER
  // (or unknown future) entries by re-appending them on save.
  const visibleOrder = me.listPriorityOrder.filter((s) =>
    VISIBLE_SOURCES.includes(s)
  )
  // Defensive: if the server somehow omitted a visible source, append it.
  for (const s of VISIBLE_SOURCES) {
    if (!visibleOrder.includes(s)) visibleOrder.push(s)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = visibleOrder.indexOf(active.id as ListSource)
    const newIndex = visibleOrder.indexOf(over.id as ListSource)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(visibleOrder, oldIndex, newIndex)
    const fullOrder: ListSource[] = [...reordered, 'OTHER']
    try {
      await update.mutateAsync(fullOrder)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update order')
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e) => void handleDragEnd(e)}
    >
      <SortableContext
        items={visibleOrder}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {visibleOrder.map((source, idx) => (
            <SourceRow key={source} source={source} position={idx + 1} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

interface SourceRowProps {
  source: ListSource
  position: number
}

function SourceRow({ source, position }: SourceRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: source })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-2 py-2"
    >
      <DragHandle listeners={listeners} attributes={attributes} />
      <div className="w-6 text-xs text-muted-foreground">{position}.</div>
      <div className="text-sm font-medium text-foreground">
        {SOURCE_LABEL[source]}
      </div>
    </Card>
  )
}
