// Logic for RatingConfigEditor: the unified category + enjoyment priority
// list, its validation (weights summing to exactly 1.00, names present and
// unique), the bulk weight operations, and the save/reset writers.

import { useEffect, useImperativeHandle, useMemo, useState } from 'react'
import type { Ref } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'
import { toast } from '@/components/ui/sonner'
import {
  RATING_WEIGHT_SUM_TARGET_CENTS,
  useUpdateRatingConfig,
  type MeData,
} from '@/lib/api/me'
import { useSortableSensors } from '../hooks/useSortableSensors'

// The editor renders a single unified list where categories and (optionally)
// "Enjoyment" share the same priority order. The first item in the list is
// the highest priority — it receives the rounding remainder when
// distributing weights equally and is what the user can drag to reorder.
export type EditableItem =
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

export type CategoryItem = Extract<EditableItem, { kind: 'category' }>

export const ENJOYMENT_KEY = 'ENJOYMENT' as const

export interface RatingConfigEditorHandle {
  // Saves if dirty (no-op returning true otherwise). Returns false when
  // there's nothing to save yet because the current state is invalid (bad
  // weight sum, empty/duplicate name) — the validation message is already
  // visible below the weight-sum card, so the caller just needs to know not
  // to proceed.
  save: () => Promise<boolean>
}

export function useRatingConfigEditor(
  me: MeData,
  ref: Ref<RatingConfigEditorHandle>
) {
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

  useEffect(() => {
    setItems(initial.items)
    setIncludeEnjoyment(initial.includeEnjoyment)
  }, [initial])

  const sensors = useSortableSensors()

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
    (i): i is CategoryItem => i.kind === 'category'
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

  const handleSave = async (): Promise<boolean> => {
    if (!canSave) return false
    const enjoymentIdx = items.findIndex((i) => i.kind === 'enjoyment')
    const enjoymentItem = items.find((i) => i.kind === 'enjoyment')
    try {
      await update.mutateAsync({
        categories: items
          .filter((i): i is CategoryItem => i.kind === 'category')
          .map((c) => ({
            ...(c.id ? { id: c.id } : {}),
            name: c.name.trim(),
            weight: roundCents(c.weight),
          })),
        includeEnjoyment,
        enjoymentWeight: roundCents(enjoymentItem?.weight ?? 0),
        // Persist enjoyment's place in the unified list. Default to end
        // of list when the row isn't currently present.
        enjoymentSortOrder: enjoymentIdx >= 0 ? enjoymentIdx : items.length,
      })
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
      return false
    }
  }

  const handleReset = () => {
    setItems(initial.items)
    setIncludeEnjoyment(initial.includeEnjoyment)
  }

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        if (!dirty) return true
        return handleSave()
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dirty, canSave, items, includeEnjoyment]
  )

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
        const inserted: EditableItem = {
          kind: 'enjoyment',
          localKey: ENJOYMENT_KEY,
          weight: seedWeight,
        }
        return [...prev.slice(0, insertAt), inserted, ...prev.slice(insertAt)]
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

  // Per-row writers, keyed by the row's localKey.
  const renameCategory = (localKey: string, name: string) =>
    setItems((prev) =>
      prev.map((i) =>
        i.localKey === localKey && i.kind === 'category' ? { ...i, name } : i
      )
    )

  const setWeight = (localKey: string, weight: number) =>
    setItems((prev) =>
      prev.map((i) => (i.localKey === localKey ? { ...i, weight } : i))
    )

  const deleteItem = (localKey: string) =>
    setItems((prev) => prev.filter((i) => i.localKey !== localKey))

  return {
    visibleItems,
    sensors,
    handleDragEnd,

    // Per-row edits
    renameCategory,
    setWeight,
    deleteItem,

    // Bulk actions
    handleAdd,
    handleSortByWeight,
    handleDistributeEqually,

    // Enjoyment
    includeEnjoyment,
    handleEnjoymentToggle,

    // Validation
    cents,
    sumValid,
    hasEmptyName,
    hasDuplicateName,

    // Save / reset
    dirty,
    canSave,
    isSaving: update.isPending,
    handleSave: () => void handleSave(),
    handleReset,
  }
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
