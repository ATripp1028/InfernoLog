import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Trash2 } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  RatingCategory,
  useCreateRatingCategory,
  useDeleteRatingCategory,
  useReorderRatingCategories,
  useUpdateRatingCategory,
} from '@/lib/api/me'
import { DragHandle } from './DragHandle'

interface RatingCategoriesListProps {
  categories: RatingCategory[]
}

export function RatingCategoriesList({ categories }: RatingCategoriesListProps) {
  const reorder = useReorderRatingCategories()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = categories.findIndex((c) => c.id === active.id)
    const newIndex = categories.findIndex((c) => c.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(categories, oldIndex, newIndex)
    try {
      await reorder.mutateAsync(reordered.map((c) => c.id))
      toast.success('Order updated')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reorder'
      toast.error(msg)
    }
  }

  return (
    <div className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => void handleDragEnd(e)}
      >
        <SortableContext
          items={categories.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {categories.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <AddCategoryRow />
    </div>
  )
}

interface CategoryRowProps {
  category: RatingCategory
}

function CategoryRow({ category }: CategoryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id })
  const update = useUpdateRatingCategory()
  const del = useDeleteRatingCategory()
  const [name, setName] = useState(category.name)
  const [weight, setWeight] = useState(String(category.weight))

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  const commitName = async () => {
    const trimmed = name.trim()
    if (trimmed === category.name) return
    if (!trimmed) {
      setName(category.name)
      return
    }
    try {
      await update.mutateAsync({ id: category.id, name: trimmed })
      toast.success('Category updated')
    } catch (err) {
      setName(category.name)
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  const commitWeight = async () => {
    const parsed = Number(weight)
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      setWeight(String(category.weight))
      toast.error('Weight must be between 0 and 100')
      return
    }
    if (parsed === category.weight) return
    try {
      await update.mutateAsync({ id: category.id, weight: parsed })
      toast.success('Category updated')
    } catch (err) {
      setWeight(String(category.weight))
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  const handleDelete = async () => {
    try {
      await del.mutateAsync(category.id)
      toast.success('Category deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-[var(--color-border-subtle)] bg-card px-2 py-2"
    >
      <DragHandle listeners={listeners} attributes={attributes} />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void commitName()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="flex-1"
        placeholder="Category name"
      />
      <Input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={() => void commitWeight()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="w-24"
        placeholder="Weight"
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void handleDelete()}
        disabled={del.isPending}
        aria-label="Delete category"
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  )
}

function AddCategoryRow() {
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('1')
  const create = useCreateRatingCategory()

  const handleAdd = async () => {
    const trimmed = name.trim()
    const parsed = Number(weight)
    if (!trimmed) {
      toast.error('Category name is required')
      return
    }
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      toast.error('Weight must be between 0 and 100')
      return
    }
    try {
      await create.mutateAsync({ name: trimmed, weight: parsed })
      toast.success('Category added')
      setName('')
      setWeight('1')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add')
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-[var(--color-border)] bg-transparent px-2 py-2">
      <div className="h-8 w-8" />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New category"
        className="flex-1"
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleAdd()
        }}
      />
      <Input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        className="w-24"
        placeholder="Weight"
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleAdd()
        }}
      />
      <Button
        onClick={() => void handleAdd()}
        disabled={create.isPending || !name.trim()}
        size="sm"
      >
        Add
      </Button>
    </div>
  )
}
