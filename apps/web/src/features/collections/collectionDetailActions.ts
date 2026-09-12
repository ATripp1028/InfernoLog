import {
  CopyPlus,
  ListOrdered,
  Pencil,
  Plus,
  Shuffle,
  Trash2,
} from 'lucide-react'
import { CollectionOrdering } from '@infernolog/core'
import type { FabAction } from '@/context/FabActionsContext'

/**
 * The collection page's FAB. "Add levels" is first — the FAB treats
 * actions[0] as the primary action. Every collection can be added to another;
 * Convert appears only where the ordering can change (never Favorites or
 * Least Favorites); built-in collections drop Edit/Delete.
 */
export function collectionDetailActions(opts: {
  isCustom: boolean
  /** The ordering Convert would switch to, or null when it is fixed. */
  convertTo: CollectionOrdering | null
  onAddLevels: () => void
  onCopyTo: () => void
  onConvert: () => void
  onEdit: () => void
  onDelete: () => void
}): FabAction[] {
  const actions: FabAction[] = [
    {
      key: 'add',
      label: 'Add levels',
      icon: Plus,
      onClick: opts.onAddLevels,
    },
    {
      key: 'copy',
      label: 'Add to another collection',
      icon: CopyPlus,
      onClick: opts.onCopyTo,
    },
  ]
  if (opts.convertTo) {
    const toUnordered = opts.convertTo === CollectionOrdering.UNORDERED
    actions.push({
      key: 'convert',
      label: toUnordered ? 'Convert to unordered' : 'Convert to ordered',
      icon: toUnordered ? Shuffle : ListOrdered,
      onClick: opts.onConvert,
    })
  }
  if (opts.isCustom) {
    actions.push(
      {
        key: 'edit',
        label: 'Edit collection',
        icon: Pencil,
        onClick: opts.onEdit,
      },
      {
        key: 'delete',
        label: 'Delete collection',
        icon: Trash2,
        danger: true,
        onClick: opts.onDelete,
      }
    )
  }
  return actions
}
