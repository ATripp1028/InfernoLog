import { Copy } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'

interface CopyableIdProps {
  /** The id to display and copy. Widths differ naturally by digit count. */
  id: string
  /**
   * What kind of id this is, for the toast and the a11y label
   * (e.g. "Level ID", "Song ID"). Defaults to "ID".
   */
  label?: string
  className?: string
}

/**
 * A monospace id pill that copies its value to the clipboard on click and
 * confirms via the app's single toast channel — no inline "Copied" swap, no
 * icon-state change. Auto-sizes to its content, so a 6- and an 8-digit id
 * render at different widths. Keyboard-accessible and announced: it is a real
 * interactive control, not decoration.
 *
 * New in the Global Level Page PR; used here only. Migrating the app's other
 * id spots onto it is a separate PR.
 */
export function CopyableId({ id, label = 'ID', className }: CopyableIdProps) {
  async function handleCopy(e: React.MouseEvent) {
    // Stop the click from reaching a clickable ancestor (e.g. a list row that
    // navigates on click / adds to a collection on double-click) — copying an
    // id should never also trigger the row.
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(id)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy ${label} ${id}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 leading-none',
        'text-[11px] font-medium',
        'transition-opacity hover:opacity-90 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-danger-soft/50',
        className
      )}
      style={{
        fontFamily: 'var(--font-mono)',
        backgroundColor: '#2d1b1b',
        color: '#ff8a8a',
      }}
    >
      <span>{id}</span>
      <Copy size={12} className="opacity-60" aria-hidden />
    </button>
  )
}
