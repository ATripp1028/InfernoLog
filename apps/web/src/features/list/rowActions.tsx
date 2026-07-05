import { FolderPlus, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export interface RowActionHandlers {
  onEdit: () => void
  onDelete: () => void
  onAddToCollection: () => void
}

// Right-click context menu wrapping a desktop row. The trigger child must be a
// DOM element (asChild), so callers pass a wrapping <div>.
export function RowContextMenu({
  handlers,
  children,
}: {
  handlers: RowActionHandlers
  children: React.ReactNode
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={handlers.onAddToCollection}>
          <FolderPlus size={14} /> Add to a Collection
        </ContextMenuItem>
        <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
        <ContextMenuItem onSelect={handlers.onEdit}>
          <Pencil size={14} /> Edit
        </ContextMenuItem>
        <ContextMenuItem destructive onSelect={handlers.onDelete}>
          <Trash2 size={14} /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// Hover-revealed kebab opening the same actions via a popover. For discovery /
// mouse-only users alongside the right-click menu. Controlled by the parent so
// opening one row's menu closes any other that's open.
export function RowActionsKebab({
  handlers,
  open,
  onOpenChange,
}: {
  handlers: RowActionHandlers
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Row actions"
          onClick={(e) => e.stopPropagation()}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-bg-elevated)]/80 text-text-secondary opacity-0 backdrop-blur transition-opacity hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
        >
          <MoreVertical size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="min-w-[8rem]">
        <MenuButton
          icon={FolderPlus}
          label="Add to a Collection"
          onClick={handlers.onAddToCollection}
        />
        <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
        <MenuButton icon={Pencil} label="Edit" onClick={handlers.onEdit} />
        <MenuButton
          icon={Trash2}
          label="Delete"
          destructive
          onClick={handlers.onDelete}
        />
      </PopoverContent>
    </Popover>
  )
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Pencil
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-[var(--color-bg-subtle)] ' +
        (destructive ? 'text-danger' : 'text-text-primary')
      }
    >
      <Icon size={14} /> {label}
    </button>
  )
}
