import {
  Check,
  Flag,
  FolderPlus,
  MoreVertical,
  Pencil,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
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
import type { FlowPath } from '@/features/logging/types'

export interface RowActionHandlers {
  onEditRun: () => void
  onEditLevel: () => void
  onDelete: () => void
  onAddToCollection: () => void
  // Only present for levels that aren't already completed — a level can only
  // hold one completion, so once it has one there's nothing new to log.
  onLog?: (path: FlowPath) => void
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
        {handlers.onLog && (
          <>
            <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
            <ContextMenuItem onSelect={() => handlers.onLog!('completion')}>
              <Check size={14} /> Log a completion
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => handlers.onLog!('progress')}>
              <Flag size={14} /> Log progress
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => handlers.onLog!('drop')}>
              <X size={14} /> Drop this level
            </ContextMenuItem>
          </>
        )}
        <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
        <ContextMenuItem onSelect={handlers.onEditRun}>
          <Pencil size={14} /> Edit most recent run
        </ContextMenuItem>
        <ContextMenuItem onSelect={handlers.onEditLevel}>
          <Settings2 size={14} /> Edit level details
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
        {handlers.onLog && (
          <>
            <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
            <MenuButton
              icon={Check}
              label="Log a completion"
              onClick={() => handlers.onLog!('completion')}
            />
            <MenuButton
              icon={Flag}
              label="Log progress"
              onClick={() => handlers.onLog!('progress')}
            />
            <MenuButton
              icon={X}
              label="Drop this level"
              onClick={() => handlers.onLog!('drop')}
            />
          </>
        )}
        <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
        <MenuButton
          icon={Pencil}
          label="Edit most recent run"
          onClick={handlers.onEditRun}
        />
        <MenuButton
          icon={Settings2}
          label="Edit level details"
          onClick={handlers.onEditLevel}
        />
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
