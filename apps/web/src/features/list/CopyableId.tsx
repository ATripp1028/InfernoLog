import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/sonner'

// A level ID rendered as a button that copies to the clipboard on click.
export function CopyableId({
  id,
  className,
}: {
  id: string
  className?: string
}) {
  async function copy(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(id)
      toast.success(`Copied ${id}`)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy level ID"
      className={cn(
        'font-mono hover:text-text-primary hover:underline',
        className
      )}
    >
      {id}
    </button>
  )
}
