import { Pencil } from 'lucide-react'

interface LevelNotesProps {
  notes: string | null
  isOwner: boolean
  onEdit?: () => void
}

/**
 * The user's free-text notes for the level.
 */
export function LevelNotes({ notes, isOwner, onEdit }: LevelNotesProps) {
  if (!notes && !isOwner) return null

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none text-text-secondary">📓</span>
          <span className="text-[13px] font-medium text-text-primary">
            About this level
          </span>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={onEdit}
            className="flex h-[30px] items-center gap-1.5 rounded-btn border border-border bg-white/5 px-3 text-xs text-text-secondary transition-colors hover:bg-bg-subtle hover:text-text-primary md:h-[32px] md:border-border-subtle"
          >
            <Pencil size={12} />
            Edit
          </button>
        )}
      </div>

      {notes ? (
        <div className="rounded-card border border-border-subtle bg-bg-inset px-4 py-3">
          <p className="text-[13px] leading-relaxed text-text-body md:text-sm">
            {notes}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="w-full rounded-card border border-dashed border-border-subtle py-5 text-sm text-text-tertiary transition-colors hover:border-border hover:text-text-secondary"
        >
          + Add notes about this level
        </button>
      )}
    </div>
  )
}
