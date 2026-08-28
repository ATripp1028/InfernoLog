import { forwardRef } from 'react'
import { DndContext, closestCenter } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDownWideNarrow, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/generic/button'
import { Card } from '@/components/generic/card'
import { Input } from '@/components/generic/input'
import { Switch } from '@/components/generic/switch'
import { StepperInput } from '@/components/generic/stepper-input'
import { type MeData } from '@/lib/api/me'
import { DragHandle } from '@/components/generic/drag-handle'
import {
  ENJOYMENT_KEY,
  useRatingConfigEditor,
  type CategoryItem,
  type EditableItem,
  type RatingConfigEditorHandle,
} from './useRatingConfigEditor'

export type { RatingConfigEditorHandle }

interface RatingConfigEditorProps {
  me: MeData
  // Onboarding submits the whole Rating step at once via its own Continue
  // button (see RatingConfigEditorHandle) — Settings' standalone section has
  // no such outer submit, so it keeps its own Save/Reset buttons.
  hideActions?: boolean
}

/**
 * The weighted-rating category editor: names, weights, and drag-to-reorder priority.
 */
export const RatingConfigEditor = forwardRef<
  RatingConfigEditorHandle,
  RatingConfigEditorProps
>(function RatingConfigEditor({ me, hideActions }, ref) {
  const {
    visibleItems,
    sensors,
    handleDragEnd,
    renameCategory,
    setWeight,
    deleteItem,
    handleAdd,
    handleSortByWeight,
    handleDistributeEqually,
    includeEnjoyment,
    handleEnjoymentToggle,
    cents,
    sumValid,
    hasEmptyName,
    hasDuplicateName,
    dirty,
    canSave,
    isSaving,
    handleSave,
    handleReset,
  } = useRatingConfigEditor(me, ref)

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
                  onChangeName={(name) => renameCategory(item.localKey, name)}
                  onChangeWeight={(weight) => setWeight(item.localKey, weight)}
                  onDelete={() => deleteItem(item.localKey)}
                />
              ) : (
                <EnjoymentRow
                  key={item.localKey}
                  item={item}
                  onChangeWeight={(weight) => setWeight(ENJOYMENT_KEY, weight)}
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

      <Card className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex-1 space-y-1">
          <div className="text-sm font-medium text-foreground">
            Include enjoyment in weighted average
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, your enjoyment score participates in the priority list
            above and counts toward the weight total.
          </p>
        </div>
        <Switch
          checked={includeEnjoyment}
          onCheckedChange={handleEnjoymentToggle}
        />
      </Card>

      <Card
        variant={sumValid ? 'success' : 'danger'}
        className="flex items-center justify-between gap-4 px-4 py-3"
      >
        <div className="text-sm text-foreground">
          Active weights total:{' '}
          <span className="font-mono">{(cents / 100).toFixed(2)}</span> /{' '}
          <span className="font-mono">1.00</span>
        </div>
        {!sumValid && (
          <div className="text-xs text-danger">
            Must equal exactly 1.00 to save.
          </div>
        )}
      </Card>

      {(hasEmptyName || hasDuplicateName) && (
        <p className="text-xs text-danger">
          {hasEmptyName
            ? 'Every category needs a name.'
            : 'Category names must be unique.'}
        </p>
      )}

      {!hideActions && (
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={!canSave || isSaving}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
          <Button
            variant="ghost"
            onClick={handleReset}
            disabled={!dirty || isSaving}
          >
            Reset
          </Button>
        </div>
      )}
    </div>
  )
})

interface CategoryRowProps {
  item: CategoryItem
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.localKey })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  // On narrow screens the row stacks: top line is handle + name + delete,
  // bottom line is the stepper aligned to the right. `sm:contents` flattens
  // the mobile wrapper so on >=640px every child becomes a direct flex
  // child of the Card again (single-line layout).
  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-2 px-2 py-2 sm:flex-row sm:items-center"
    >
      <div className="flex items-center gap-2 sm:contents">
        <DragHandle listeners={listeners} attributes={attributes} />
        <Input
          value={item.name}
          onChange={(e) => onChangeName(e.target.value)}
          className="flex-1"
          placeholder="Category name"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Delete category"
          className="sm:order-last"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
      <StepperInput
        value={item.weight}
        onChange={onChangeWeight}
        min={0}
        max={1}
        aria-label={`Weight for ${item.name || 'category'}`}
        className="self-end sm:self-auto"
      />
    </Card>
  )
}

interface EnjoymentRowProps {
  item: Extract<EditableItem, { kind: 'enjoyment' }>
  onChangeWeight: (weight: number) => void
}

function EnjoymentRow({ item, onChangeWeight }: EnjoymentRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.localKey })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  // Same stacked-on-mobile layout as CategoryRow, minus the delete button
  // (toggling Include enjoyment off is what removes the row).
  return (
    <Card
      ref={setNodeRef}
      variant="accent"
      style={style}
      className="flex flex-col gap-2 px-2 py-2 sm:flex-row sm:items-center"
    >
      <div className="flex items-center gap-2 sm:contents">
        <DragHandle listeners={listeners} attributes={attributes} />
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="rounded bg-bg-elevated px-2 py-0.5 text-xs font-medium tracking-wide text-text-primary">
            Enjoyment
          </span>
          <span className="text-xs text-muted-foreground">
            Your enjoyment score is treated like a category.
          </span>
        </div>
      </div>
      <StepperInput
        value={item.weight}
        onChange={onChangeWeight}
        min={0}
        max={1}
        aria-label="Weight for enjoyment"
        className="self-end sm:self-auto"
      />
    </Card>
  )
}
