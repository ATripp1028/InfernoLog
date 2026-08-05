import { Check, Loader2, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPresetColor } from './presets'
import type { ListPreset } from '@/lib/api/presets'

interface PresetRowProps {
  // `compact` is the desktop popover (PresetSelector) — mouse-hover reveals
  // edit/delete. `touch` is the mobile sheet (PresetSheet) — bigger tap
  // targets, actions always visible since there's no hover state.
  density: 'compact' | 'touch'
  preset: ListPreset | null // null renders the built-in "Default" option
  isSelected: boolean
  isPendingDelete: boolean
  isDeleting: boolean
  onSelect: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onDeleteClick: (e: React.MouseEvent) => void
  onEditClick: (e: React.MouseEvent) => void
  onMouseEnter?: (e: React.MouseEvent) => void
  onMouseLeave?: () => void
}

// Shared row for the preset list PresetSelector (desktop popover) and
// PresetSheet (mobile bottom sheet) both render — swatch, name, selected
// check, edit/delete icons, and the inline pending-delete confirmation.
export function PresetRow({
  density,
  preset,
  isSelected,
  isPendingDelete,
  isDeleting,
  onSelect,
  onCancelDelete,
  onConfirmDelete,
  onDeleteClick,
  onEditClick,
  onMouseEnter,
  onMouseLeave,
}: PresetRowProps) {
  const compact = density === 'compact'
  const rowPadding = compact ? 'px-2 py-1.5' : 'px-2 py-2.5'
  const rounded = compact ? 'rounded-sm' : 'rounded-md'
  const gap = compact ? 'gap-1' : 'gap-2'
  const checkSize = compact ? 12 : 14
  const spinnerSize = compact ? 13 : 14
  const actionIconSize = compact ? 11 : 13
  const confirmBtnPadding = compact ? 'px-1 py-0.5' : 'px-2 py-1'
  const actionsGap = compact ? 'gap-0.5' : 'gap-1'
  const actionIconPadding = compact ? 'p-0.5' : 'p-1'

  if (isPendingDelete) {
    return (
      <div className={cn('flex items-center', gap, rounded, rowPadding)}>
        <span
          className={cn(
            'flex-1 truncate text-text-secondary',
            compact ? 'text-xs' : 'text-sm'
          )}
        >
          Delete "{preset?.name}"?
        </span>
        {isDeleting ? (
          <Loader2
            size={spinnerSize}
            className="shrink-0 animate-spin text-text-tertiary"
          />
        ) : (
          <>
            <button
              type="button"
              onClick={onCancelDelete}
              className={cn(
                'cursor-pointer rounded text-xs text-text-secondary hover:bg-[var(--color-bg-subtle)]',
                confirmBtnPadding
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              className={cn(
                'cursor-pointer rounded text-xs font-medium text-red-500 hover:bg-red-500/10',
                confirmBtnPadding
              )}
            >
              Delete
            </button>
          </>
        )}
      </div>
    )
  }

  const color = preset ? getPresetColor(preset.color) : null

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'group flex w-full items-center gap-2 text-sm cursor-pointer',
        rowPadding,
        rounded,
        'hover:bg-[var(--color-bg-subtle)]',
        isSelected && 'font-medium'
      )}
    >
      {color ? (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color.hex }}
        />
      ) : (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--color-border)]" />
      )}
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-text-primary',
          !compact && 'text-left'
        )}
      >
        {preset?.name ?? 'Default'}
      </span>
      {isSelected && !isDeleting && (
        <Check
          size={checkSize}
          className="shrink-0 text-[var(--color-primary)]"
        />
      )}
      {preset && (
        <span
          className={cn(
            'flex shrink-0 items-center',
            actionsGap,
            compact && 'invisible group-hover:visible'
          )}
        >
          <span
            role="button"
            onClick={onEditClick}
            aria-label={`Edit ${preset.name}`}
            className={cn(
              'cursor-pointer rounded text-text-tertiary hover:text-text-primary',
              actionIconPadding
            )}
          >
            <Pencil size={actionIconSize} />
          </span>
          <span
            role="button"
            onClick={onDeleteClick}
            aria-label={`Delete ${preset.name}`}
            className={cn(
              'cursor-pointer rounded text-text-tertiary hover:text-red-500',
              actionIconPadding
            )}
          >
            <Trash2 size={actionIconSize} />
          </span>
        </span>
      )}
    </button>
  )
}
