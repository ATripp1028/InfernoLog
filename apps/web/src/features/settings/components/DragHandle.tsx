import { GripVertical } from 'lucide-react'
import type { DraggableAttributes } from '@dnd-kit/core'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { cn } from '@/lib/utils'

interface DragHandleProps extends React.HTMLAttributes<HTMLButtonElement> {
  listeners?: SyntheticListenerMap | undefined
  attributes?: DraggableAttributes | undefined
}

export function DragHandle({
  listeners,
  attributes,
  className,
  ...props
}: DragHandleProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-8 w-8 touch-none cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-[var(--color-bg-elevated)] hover:text-foreground active:cursor-grabbing',
        className
      )}
      aria-label="Drag to reorder"
      {...attributes}
      {...listeners}
      {...props}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}
