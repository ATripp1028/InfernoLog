import { useMemo, useState } from 'react'
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
import { Plus, Trash2 } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  RATING_WEIGHT_SUM_TARGET,
  RATING_WEIGHT_SUM_TOLERANCE,
  useUpdateRatingConfig,
  type MeData,
} from '@/lib/api/me'
import { DragHandle } from './DragHandle'

// One editable row in the form. `id` is the server id when this row exists
// remotely; absent for rows the user just added. `localKey` is a stable
// React key + dnd-kit id so reorder/delete don't lose their visual identity.
interface EditableCategory {
  localKey: string
  id?: string
  name: string
  weight: number
}

interface RatingConfigEditorProps {
  me: MeData
}

export function RatingConfigEditor({ me }: RatingConfigEditorProps) {
  const update = useUpdateRatingConfig()

  const initial = useMemo(
    () => ({
      categories: me.ratingCategories.map((c) => ({
        localKey: c.id,
        id: c.id,
        name: c.name,
        weight: c.weight,
      })),
      includeEnjoyment: me.includeEnjoyment,
      enjoymentWeight: me.enjoymentWeight,
    }),
    [me.ratingCategories, me.includeEnjoyment, me.enjoymentWeight]
  )

  const [categories, setCategories] = useState<EditableCategory[]>(
    initial.categories
  )
  const [includeEnjoyment, setIncludeEnjoyment] = useState(
    initial.includeEnjoyment
  )
  const [enjoymentWeight, setEnjoymentWeight] = useState(
    initial.enjoymentWeight
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const sum =
    categories.reduce((acc, c) => acc + (Number.isFinite(c.weight) ? c.weight : 0), 0) +
    (includeEnjoyment ? (Number.isFinite(enjoymentWeight) ? enjoymentWeight : 0) : 0)
  const sumValid =
    Math.abs(sum - RATING_WEIGHT_SUM_TARGET) <= RATING_WEIGHT_SUM_TOLERANCE

  const hasEmptyName = categories.some((c) => !c.name.trim())
  const hasDuplicateName = (() => {
    const seen = new Set<string>()
    for (const c of categories) {
      const key = c.name.trim().toLowerCase()
      if (!key) continue
      if (seen.has(key)) return true
      seen.add(key)
    }
    return false
  })()

  const dirty =
    !equalCategories(categories, initial.categories) ||
    includeEnjoyment !== initial.includeEnjoyment ||
    enjoymentWeight !== initial.enjoymentWeight

  const canSave = dirty && sumValid && !hasEmptyName && !hasDuplicateName

  const handleSave = async () => {
    try {
      // Round-trip through 4-decimal fixed values to match the Decimal(5,4)
      // DB column. Stops the form from sending more precision than we store
      // and prevents the round-tripped response from looking "dirty" because
      // the user typed 0.33333 but we store 0.3333.
      await update.mutateAsync({
        categories: categories.map((c) => ({
          ...(c.id ? { id: c.id } : {}),
          name: c.name.trim(),
          weight: roundWeight(c.weight),
        })),
        includeEnjoyment,
        enjoymentWeight: roundWeight(enjoymentWeight),
      })
      toast.success('Rating config saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const handleReset = () => {
    setCategories(initial.categories)
    setIncludeEnjoyment(initial.includeEnjoyment)
    setEnjoymentWeight(initial.enjoymentWeight)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setCategories((prev) => {
      const oldIndex = prev.findIndex((c) => c.localKey === active.id)
      const newIndex = prev.findIndex((c) => c.localKey === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const handleAdd = () => {
    setCategories((prev) => [
      ...prev,
      {
        localKey: `new-${crypto.randomUUID()}`,
        name: '',
        weight: 0,
      },
    ])
  }

  const handleDistributeEqually = () => {
    const activeCount = categories.length + (includeEnjoyment ? 1 : 0)
    if (activeCount === 0) return
    // Distribute as evenly as 4-decimal precision allows; give the last
    // entry the rounding remainder so the sum hits exactly 1.0000.
    const base = Math.floor((1 / activeCount) * 10000) / 10000
    const used = base * (activeCount - 1)
    const remainder = roundWeight(1 - used)
    if (includeEnjoyment && categories.length === 0) {
      setEnjoymentWeight(remainder)
      return
    }
    const newCategories = categories.map((c) => ({ ...c, weight: base }))
    if (includeEnjoyment) {
      setEnjoymentWeight(remainder)
    } else if (newCategories.length > 0) {
      const last = newCategories[newCategories.length - 1]!
      newCategories[newCategories.length - 1] = { ...last, weight: remainder }
    }
    setCategories(newCategories)
  }

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={categories.map((c) => c.localKey)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {categories.map((cat) => (
              <CategoryRow
                key={cat.localKey}
                category={cat}
                onChangeName={(name) =>
                  setCategories((prev) =>
                    prev.map((c) =>
                      c.localKey === cat.localKey ? { ...c, name } : c
                    )
                  )
                }
                onChangeWeight={(weight) =>
                  setCategories((prev) =>
                    prev.map((c) =>
                      c.localKey === cat.localKey ? { ...c, weight } : c
                    )
                  )
                }
                onDelete={() =>
                  setCategories((prev) =>
                    prev.filter((c) => c.localKey !== cat.localKey)
                  )
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        className="gap-2"
      >
        <Plus className="h-4 w-4" />
        Add category
      </Button>

      <div className="space-y-3 rounded-md border border-[var(--color-border-subtle)] bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="text-sm font-medium text-foreground">
              Include enjoyment in weighted average
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, your enjoyment score becomes one of the active
              weights and must be set just like a category.
            </p>
          </div>
          <Switch
            checked={includeEnjoyment}
            onCheckedChange={setIncludeEnjoyment}
          />
        </div>
        {includeEnjoyment && (
          <div className="flex items-center gap-2 pl-1">
            <span className="text-sm text-muted-foreground">Weight</span>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.0001}
              value={formatWeight(enjoymentWeight)}
              onChange={(e) => setEnjoymentWeight(parseWeight(e.target.value))}
              className="w-28"
            />
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex items-center justify-between gap-4 rounded-md border px-4 py-3',
          sumValid
            ? 'border-[var(--color-success)]/40 bg-[var(--color-success-dim)]'
            : 'border-[var(--color-danger)]/40 bg-[var(--color-danger-dim)]'
        )}
      >
        <div className="text-sm text-foreground">
          Active weights total:{' '}
          <span className="font-mono">{formatWeight(sum)}</span> /{' '}
          <span className="font-mono">1.0000</span>
        </div>
        {!sumValid && (
          <div className="text-xs text-[var(--color-danger)]">
            Must equal exactly 1.0000 to save.
          </div>
        )}
      </div>

      {(hasEmptyName || hasDuplicateName) && (
        <p className="text-xs text-[var(--color-danger)]">
          {hasEmptyName
            ? 'Every category needs a name.'
            : 'Category names must be unique.'}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={() => void handleSave()}
          disabled={!canSave || update.isPending}
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <Button
          variant="ghost"
          onClick={handleReset}
          disabled={!dirty || update.isPending}
        >
          Reset
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDistributeEqually}
        >
          Distribute equally
        </Button>
      </div>
    </div>
  )
}

interface CategoryRowProps {
  category: EditableCategory
  onChangeName: (name: string) => void
  onChangeWeight: (weight: number) => void
  onDelete: () => void
}

function CategoryRow({
  category,
  onChangeName,
  onChangeWeight,
  onDelete,
}: CategoryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.localKey })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-[var(--color-border-subtle)] bg-card px-2 py-2"
    >
      <DragHandle listeners={listeners} attributes={attributes} />
      <Input
        value={category.name}
        onChange={(e) => onChangeName(e.target.value)}
        className="flex-1"
        placeholder="Category name"
      />
      <Input
        type="number"
        min={0}
        max={1}
        step={0.0001}
        value={formatWeight(category.weight)}
        onChange={(e) => onChangeWeight(parseWeight(e.target.value))}
        className="w-28"
        placeholder="Weight"
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        aria-label="Delete category"
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  )
}

// 4-decimal precision matches the Decimal(5,4) DB column. Anything beyond
// that is silently truncated to keep client and server in sync.
function roundWeight(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 10000) / 10000
}

function formatWeight(n: number): string {
  if (!Number.isFinite(n)) return '0.0000'
  return n.toFixed(4)
}

function parseWeight(raw: string): number {
  if (raw.trim() === '') return 0
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return n
}

function equalCategories(a: EditableCategory[], b: EditableCategory[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    const bi = b[i]!
    if (ai.id !== bi.id) return false
    if (ai.name !== bi.name) return false
    if (roundWeight(ai.weight) !== roundWeight(bi.weight)) return false
  }
  return true
}
