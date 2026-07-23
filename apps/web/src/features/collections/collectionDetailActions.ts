import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { FabAction } from '@/context/FabActionsContext'

// "Add levels" is first — the FAB treats actions[0] as the primary action.
// Built-in collections drop Edit/Delete.
export function collectionDetailActions(opts: {
  isCustom: boolean
  onAddLevels: () => void
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
  ]
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
