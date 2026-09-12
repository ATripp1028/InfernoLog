import { Copy } from 'lucide-react'
import { toast } from '@/components/generic/sonner'
import { cn } from '@/lib/utils'

interface IdChipProps {
  /** The id to display. Widths differ naturally by digit count. */
  id: string
  /**
   * What kind of id this is, for the toast and the a11y label
   * (e.g. "Level ID", "Song ID"). Defaults to "ID".
   */
  label?: string
  className?: string
}

// The shared surface: a monospace pill in the app's id colours. Both chips
// below wear it, so a row's id and a page's id read as the same thing.
const ID_CHIP_CLASS =
  'inline-flex items-center gap-1.5 rounded-md leading-none font-medium'
const ID_CHIP_STYLE = {
  fontFamily: 'var(--font-mono)',
  backgroundColor: '#2d1b1b',
  color: '#ff8a8a',
} as const

/**
 * A monospace id pill that does nothing when clicked.
 *
 * The non-interactive half of {@link CopyableId}, for the one place the copy
 * button cannot go: inside a row that is itself a link. A `<button>` nested in
 * an `<a>` is invalid markup, and a click meant for the id would follow the
 * anchor instead. Rows use this; pages use `CopyableId`.
 *
 * Sized smaller than `CopyableId` on purpose — in a row the id sits beside the
 * level's name and must not compete with it.
 */
export function IdChip({ id, label = 'ID', className }: IdChipProps) {
  return (
    <span
      title={`${label} ${id}`}
      className={cn(ID_CHIP_CLASS, 'px-1.5 py-0.5 text-[10px]', className)}
      style={ID_CHIP_STYLE}
    >
      <span className="sr-only">{label}:</span>
      {id}
    </span>
  )
}

/**
 * A monospace id pill that copies its value to the clipboard on click and
 * confirms via the app's single toast channel — no inline "Copied" swap, no
 * icon-state change. Auto-sizes to its content, so a 6- and an 8-digit id
 * render at different widths. Keyboard-accessible and announced: it is a real
 * interactive control, not decoration.
 *
 * Cannot be used inside a row that is a link — see {@link IdChip}.
 */
export function CopyableId({ id, label = 'ID', className }: IdChipProps) {
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
        ID_CHIP_CLASS,
        'px-2 py-1 text-[11px]',
        'transition-opacity hover:opacity-90 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-danger-soft/50',
        className
      )}
      style={ID_CHIP_STYLE}
    >
      <span>{id}</span>
      <Copy size={12} className="opacity-60" aria-hidden />
    </button>
  )
}
