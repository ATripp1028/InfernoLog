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
import { ArrowDownWideNarrow, Plus, Trash2 } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { StepperInput } from '@/components/ui/stepper-input'
import { cn } from '@/lib/utils'
import {
  RATING_WEIGHT_SUM_TARGET_CENTS,
  useUpdateRatingConfig,
  type MeData,
} from '@/lib/api/me'
import { DragHandle } from './DragHandle'

// The editor renders a single unified list where categories and (optionally)
// "Enjoyment" share the same priority order. The first item in the list is
// the highest priority — it receives the rounding remainder when
// distributing weights equally and is what the user can drag to reorder.
type EditableItem =
  | {
      kind: 'category'
      localKey: string
      id?: string
      name: string
      weight: number
    }
  | {
      kind: 'enjoyment'
      localKey: 'ENJOYMENT'
      weight: number
    }

const ENJOYMENT_KEY = 'ENJOYMENT' as const

interface RatingConfigEditorProps {
  me: MeData
}

export function RatingConfigEditor({ me }: RatingConfigEditorProps) {
  const update = useUpdateRatingConfig()

  // The initial snapshot drives both the "what to render on first mount" and
  // the "dirty" comparison. enjoyment's persisted position interleaves with
  // category sortOrders — we use enjoymentSortOrder as a comparable index
  // (ties resolved by putting enjoyment first when it lands on the same
  // index as a category, matching the natural reading order top→bottom).
  const initial = useMemo(() => buildInitial(me), [me])

  const [items, setItems] = useState<EditableItem[]>(initial.items)
  const [includeEnjoyment, setIncludeEnjoyment] = useState(
    initial.includeEnjoyment
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const visibleItems = useMemo(
    () => items.filter((i) => i.kind !== 'enjoyment' || includeEnjoyment),
    [items, includeEnjoyment]
  )

  const cents = visibleItems.reduce(
    (acc, i) => acc + Math.round(i.weight * 100),
    0
  )
  const sumValid = cents === RATING_WEIGHT_SUM_TARGET_CENTS

  const categoryItems = items.filter(
    (i): i is Extract<EditableItem, { kind: 'category' }> =>
      i.kind === 'category'
  )
  const hasEmptyName = categoryItems.some((c) => !c.name.trim())
  const hasDuplicateName = (() => {
    const seen = new Set<string>()
    for (const c of categoryItems) {
      const key = c.name.trim().toLowerCase()
      if (!key) continue
      if (seen.has(key)) return true
      seen.add(key)
    }
    return false
  })()

  const dirty =
    !equalItems(items, initial.items) ||
    includeEnjoyment !== initial.includeEnjoyment

  const canSave = dirty && sumValid && !hasEmptyName && !hasDuplicateName

  const handleSave = async () => {
    const enjoymentIdx = items.findIndex((i) => i.kind === 'enjoyment')
    const enjoymentItem = items.find((i) => i.kind === 'enjoyment')
    try {
      await update.mutateAsync({
        categories: items
          .filter(
            (i): i is Extract<EditableItem, { kind: 'category' }> =>
              i.kind === 'category'
          )
          .map((c) => ({
            ...(c.id ? { id: c.id } : {}),
            name: c.name.trim(),
            weight: roundCents(c.weight),
          })),
        includeEnjoyment,
        enjoymentWeight: roundCents(enjoymentItem?.weight ?? 0),
        // Persist enjoyment's place in the unified list. Default to end
        // of list when the row isn't currently present.
        enjoymentSortOrder:
          enjoymentIdx >= 0 ? enjoymentIdx : items.length,
      })
      toast.success('Rating config saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const handleReset = () => {
    setItems(initial.items)
    setIncludeEnjoyment(initial.includeEnjoyment)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.localKey === active.id)
      const newIndex = prev.findIndex((i) => i.localKey === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const handleAdd = () => {
    setItems((prev) => [
      ...prev,
      {
        kind: 'category',
        localKey: `new-${crypto.randomUUID()}`,
        name: '',
        weight: 0,
      },
    ])
  }

  const handleEnjoymentToggle = (next: boolean) => {
    setIncludeEnjoyment(next)
    setItems((prev) => {
      const existing = prev.find((i) => i.kind === 'enjoyment')
      if (next) {
        // Toggling on. Default-on rule: jump to 0.5 if the current value is
        // 0 or 1 (the unused-default values). Otherwise keep whatever the
        // user previously set so toggling-off-and-on doesn't destroy work.
        const seedWeight =
          existing && existing.weight !== 0 && existing.weight !== 1
            ? existing.weight
            : 0.5
        if (existing) {
          return prev.map((i) =>
            i.kind === 'enjoyment' ? { ...i, weight: seedWeight } : i
          )
        }
        // Insert at the persisted (or end-of-list) position.
        const insertAt = Math.min(me.enjoymentSortOrder, prev.length)
        const next: EditableItem = {
          kind: 'enjoyment',
          localKey: ENJOYMENT_KEY,
          weight: seedWeight,
        }
        return [...prev.slice(0, insertAt), next, ...prev.slice(insertAt)]
      }
      // Toggling off — keep the row in `items` so its position survives,
      // but `visibleItems` (and `sumValid`) will exclude it.
      return prev
    })
  }

  const handleDistributeEqually = () => {
    const targets = visibleItems
    const n = targets.length
    if (n === 0) return
    const baseCents = Math.floor(100 / n)
    const remainderCents = 100 - baseCents * (n - 1)
    // First visible item (highest priority) gets the remainder. Map back
    // to the original `items` array by localKey so off-list (toggled-off
    // enjoyment) entries don't get touched.
    const firstKey = targets[0]!.localKey
    setItems((prev) =>
      prev.map((i) => {
        if (i.kind === 'enjoyment' && !includeEnjoyment) return i
        const weight =
          i.localKey === firstKey ? remainderCents / 100 : baseCents / 100
        return { ...i, weight }
      })
    )
  }

  const handleSortByWeight = () => {
    setItems((prev) => {
      const visibleKeys = new Set(visibleItems.map((i) => i.localKey))
      // Stable descending sort over visible items, then merge back in the
      // positions previously held by off-list rows (hidden enjoyment) so
      // their relative spots aren't lost.
      const visibleSorted = prev
        .map((item, idx) => ({ item, idx }))
        .filter((x) => visibleKeys.has(x.item.localKey))
        .sort(
          (a, b) =>
            b.item.weight - a.item.weight ||
            // Stable tiebreak: keep current relative order on ties.
            a.idx - b.idx
        )
        .map((x) => x.item)

      const result: EditableItem[] = []
      let visibleCursor = 0
      for (const i of prev) {
        if (visibleKeys.has(i.localKey)) {
          result.push(visibleSorted[visibleCursor++]!)
        } else {
          result.push(i)
        }
      }
      return result
    })
  }

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visibleItems.map((i) => i.localKey)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {visibleItems.map((item) =>
              item.kind === 'category' ? (
                <CategoryRow
                  key={item.localKey}
                  item={item}
                  onChangeName={(name) =>
                    setItems((prev) =>
                      prev.map((i) =>
                        i.localKey === item.localKey && i.kind === 'category'
                          ? { ...i, name }
                          : i
                      )
                    )
                  }
                  onChangeWeight={(weight) =>
                    setItems((prev) =>
                      prev.map((i) =>
                        i.localKey === item.localKey ? { ...i, weight } : i
                      )
                    )
                  }
                  onDelete={() =>
                    setItems((prev) =>
                      prev.filter((i) => i.localKey !== item.localKey)
                    )
                  }
                />
              ) : (
                <EnjoymentRow
                  key={item.localKey}
                  item={item}
                  onChangeWeight={(weight) =>
                    setItems((prev) =>
                      prev.map((i) =>
                        i.localKey === ENJOYMENT_KEY ? { ...i, weight } : i
                      )
                    )
                  }
                />
              )
            )}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex flex-wrap items-center gap-2">
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSortByWeight}
          className="gap-2"
        >
          <ArrowDownWideNarrow className="h-4 w-4" />
          Sort by weight
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDistributeEqually}
        >
          Distribute equally
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border border-[var(--color-border-subtle)] bg-card px-4 py-3">
        <div className="flex-1 space-y-1">
          <div className="text-sm font-medium text-foreground">
            Include enjoyment in weighted average
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, your enjoyment score participates in the priority
            list above and counts toward the weight total.
          </p>
        </div>
        <Switch
          checked={includeEnjoyment}
          onCheckedChange={handleEnjoymentToggle}
        />
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
          <span className="font-mono">{(cents / 100).toFixed(2)}</span> /{' '}
          <span className="font-mono">1.00</span>
        </div>
        {!sumValid && (
          <div className="text-xs text-[var(--color-danger)]">
            Must equal exactly 1.00 to save.
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
      </div>
    </div>
  )
}

interface CategoryRowProps {
  item: Extract<EditableItem, { kind: 'category' }>
  onChangeName: (name: string) => void
  onChangeWeight: (weight: number) => void
  onDelete: () => void
}

function CategoryRow({
  item,
  onChangeName,
  onChangeWeight,
  onDelete,
}: CategoryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.localKey })

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
        value={item.name}
        onChange={(e) => onChangeName(e.target.value)}
        className="flex-1"
        placeholder="Category name"
      />
      <StepperInput
        value={item.weight}
        onChange={onChangeWeight}
        min={0}
        max={1}
        aria-label={`Weight for ${item.name || 'category'}`}
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

interface EnjoymentRowProps {
  item: Extract<EditableItem, { kind: 'enjoyment' }>
  onChangeWeight: (weight: number) => void
}

function EnjoymentRow({ item, onChangeWeight }: EnjoymentRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.localKey })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent-dim)] px-2 py-2"
    >
      <DragHandle listeners={listeners} attributes={attributes} />
      <div className="flex flex-1 items-center gap-2">
        <span className="rounded bg-[var(--color-bg-elevated)] px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-[var(--color-accent)]">
          Enjoyment
        </span>
        <span className="text-xs text-muted-foreground">
          Your enjoyment score is treated like a category.
        </span>
      </div>
      <StepperInput
        value={item.weight}
        onChange={onChangeWeight}
        min={0}
        max={1}
        aria-label="Weight for enjoyment"
      />
      {/* No delete button — toggling Include enjoyment off removes the row. */}
    </div>
  )
}

function buildInitial(me: MeData): {
  items: EditableItem[]
  includeEnjoyment: boolean
} {
  const cats: EditableItem[] = me.ratingCategories
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({
      kind: 'category' as const,
      localKey: c.id,
      id: c.id,
      name: c.name,
      weight: c.weight,
    }))

  // Insert enjoyment into the list at its persisted index. We splice it in
  // at the closest valid position so a stale enjoymentSortOrder (e.g. 99
  // when there are only 3 categories) lands at the end.
  if (me.includeEnjoyment) {
    const insertAt = Math.min(me.enjoymentSortOrder, cats.length)
    cats.splice(insertAt, 0, {
      kind: 'enjoyment',
      localKey: ENJOYMENT_KEY,
      weight: me.enjoymentWeight,
    })
  }

  return { items: cats, includeEnjoyment: me.includeEnjoyment }
}

// 2-decimal rounding — matches the Decimal(5,2) DB column and the
// integer-cents sum check. Anything finer is silently truncated so the
// server never sees more precision than it stores.
function roundCents(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function equalItems(a: EditableItem[], b: EditableItem[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    const bi = b[i]!
    if (ai.kind !== bi.kind) return false
    if (ai.localKey !== bi.localKey) return false
    if (roundCents(ai.weight) !== roundCents(bi.weight)) return false
    if (ai.kind === 'category' && bi.kind === 'category') {
      if (ai.id !== bi.id) return false
      if (ai.name !== bi.name) return false
    }
  }
  return true
}
