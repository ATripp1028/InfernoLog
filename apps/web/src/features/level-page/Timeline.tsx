import { ExternalLink, Film, Pencil } from 'lucide-react'
import { formatDate } from '@/lib/dateFormat'
import { formatNumber } from '@/features/logging/format'
import type { DateFormatPreference } from '@/lib/api/me'
import type { LevelPageData, ProgressUpdate } from './types'

// Percentage / run label for a progress update
function rangeLabel(update: ProgressUpdate): string {
  if (update.kind === 'COMPLETION') return '100%'
  if (update.runFrom != null && update.runTo != null) {
    return `run ${update.runFrom} → ${update.runTo}%`
  }
  if (update.percentage != null) return `${update.percentage}%`
  return '—'
}

function formatEntryDate(
  dateStr: string | null,
  loggedAt: string,
  uncertain: boolean,
  datePref: DateFormatPreference
): { text: string; uncertain: boolean } {
  if (!dateStr)
    return { text: formatDate(loggedAt, datePref), uncertain: false }
  return { text: formatDate(dateStr, datePref), uncertain }
}

// ─── Timeline dot ────────────────────────────────────────────────
// type DotColor = 'green' | 'grey' | 'red'

// function TimelineDot({ color }: { color: DotColor }) {
//   const outerClass =
//     color === 'green'
//       ? 'border-[var(--color-success)]'
//       : color === 'red'
//         ? 'border-[var(--color-danger)]'
//         : 'border-[#333]'
//   const innerClass =
//     color === 'green'
//       ? 'bg-[var(--color-success)]'
//       : color === 'red'
//         ? 'bg-[var(--color-danger)]'
//         : 'bg-[#555]'

//   return (
//     <div
//       className={`absolute left-[22px] flex size-5 -translate-x-1/2 items-center justify-center rounded-full border-2 bg-bg-base ${outerClass}`}
//       aria-hidden
//     >
//       <div className={`size-2 rounded-full ${innerClass}`} />
//     </div>
//   )
// }

// ─── Completion entry card ────────────────────────────────────────
function CompletionEntry({
  update,
  datePref,
  isOwner,
  onEdit,
}: {
  update: ProgressUpdate
  datePref: DateFormatPreference
  isOwner: boolean
  onEdit: () => void
}) {
  const { text: dateText, uncertain } = formatEntryDate(
    update.date,
    update.loggedAt,
    update.dateUncertain,
    datePref
  )

  return (
    <div className="relative ml-8 overflow-hidden rounded-card border border-[rgba(34,197,94,0.35)] bg-bg-surface">
      <div className="flex items-start justify-between px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-[22px] items-center rounded bg-[rgba(34,197,94,0.1)] px-2 text-[11px] font-medium text-[#5ddc8a]">
            🏆 Completion
          </span>
          <span className="text-[13px] font-medium text-text-primary">
            100%
          </span>
          <span className="text-xs text-text-secondary">
            {uncertain ? '~' : ''}
            {dateText}
          </span>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={onEdit}
            className="flex h-7 items-center gap-1 rounded-btn border border-border bg-white/5 px-2.5 text-xs text-text-secondary transition-colors hover:bg-bg-subtle"
          >
            <Pencil size={11} />
            Edit
          </button>
        )}
      </div>

      {update.notes && (
        <>
          <div className="mx-3.5 mt-3 h-px bg-[#242424]" />
          <div className="px-3.5 pb-2 pt-2.5">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[#666]">
              Notes on this run
            </p>
            <p className="text-[13px] leading-snug text-[#c8c8c8]">
              {update.notes}
            </p>
          </div>
        </>
      )}

      {/* Meta chips row */}
      {(update.highlightUrl || update.videoUrl || update.onStream) && (
        <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-3 pt-2">
          {update.highlightUrl && (
            <a
              href={update.highlightUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-[22px] items-center gap-1 rounded bg-[rgba(232,57,14,0.08)] px-2 text-[11px] font-medium text-[#ff8a6a] hover:opacity-80"
            >
              <Film size={10} />
              Highlight
            </a>
          )}
          {update.videoUrl && !update.highlightUrl && (
            <a
              href={update.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-[22px] items-center gap-1 rounded bg-white/4 px-2 text-[11px] font-medium text-text-secondary hover:opacity-80"
            >
              <ExternalLink size={10} />
              Video
            </a>
          )}
          {update.onStream && (
            <span className="inline-flex h-[22px] items-center rounded bg-white/4 px-2 text-[11px] font-medium text-text-secondary">
              📡 On stream
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Progress entry row ───────────────────────────────────────────
function ProgressEntry({
  update,
  datePref,
  isOwner,
  onEdit,
}: {
  update: ProgressUpdate
  datePref: DateFormatPreference
  isOwner: boolean
  onEdit: () => void
}) {
  const { text: dateText } = formatEntryDate(
    update.date,
    update.loggedAt,
    update.dateUncertain,
    datePref
  )

  const label = rangeLabel(update)
  const hasExtra =
    update.notes || update.highlightUrl || update.videoUrl || update.onStream

  return (
    <div className="relative ml-8 overflow-hidden rounded-card border border-border-subtle bg-[#141414]">
      <div
        className={[
          'flex items-center justify-between px-3.5',
          hasExtra ? 'pt-3 pb-1' : 'h-[46px]',
        ].join(' ')}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
          <span className="shrink-0 text-[13px] font-medium text-text-primary">
            {label}
          </span>
          <span className="shrink-0 text-xs text-text-secondary">
            {dateText}
          </span>
          {update.attempts != null && (
            <span className="text-xs text-text-tertiary">
              {formatNumber(update.attempts)} attempts
            </span>
          )}
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit entry"
            className="shrink-0 text-sm text-text-tertiary transition-colors hover:text-text-secondary"
          >
            ✎
          </button>
        )}
      </div>

      {update.notes && (
        <>
          <div className="mx-3.5 mt-2 h-px bg-[#242424]" />
          <div className="px-3.5 pb-2 pt-2.5">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[#666]">
              Notes on this run
            </p>
            <p className="text-[13px] leading-snug text-[#c8c8c8]">
              {update.notes}
            </p>
          </div>
        </>
      )}

      {(update.highlightUrl || update.videoUrl || update.onStream) && (
        <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-3 pt-2">
          {update.highlightUrl && (
            <a
              href={update.highlightUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-[22px] items-center gap-1 rounded bg-[rgba(232,57,14,0.08)] px-2 text-[11px] font-medium text-[#ff8a6a] hover:opacity-80"
            >
              <Film size={10} />
              Highlight
            </a>
          )}
          {update.videoUrl && !update.highlightUrl && (
            <a
              href={update.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-[22px] items-center gap-1 rounded bg-white/4 px-2 text-[11px] font-medium text-text-secondary hover:opacity-80"
            >
              <ExternalLink size={10} />
              Video
            </a>
          )}
          {update.onStream && (
            <span className="inline-flex h-[22px] items-center rounded bg-white/4 px-2 text-[11px] font-medium text-text-secondary">
              📡 On stream
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Drop entry card ────────────────────────────────────────────────
// A drop is an ordinary progress_update (kind=DROP), so it's edited the same
// way as a completion or progress entry — reason/date/attempts are just
// notes/date/attempts under a different label.
function DropEntry({
  update,
  datePref,
  isOwner,
  onEdit,
}: {
  update: ProgressUpdate
  datePref: DateFormatPreference
  isOwner: boolean
  onEdit: () => void
}) {
  const { text: dateText } = formatEntryDate(
    update.date,
    update.loggedAt,
    update.dateUncertain,
    datePref
  )

  return (
    <div className="relative ml-8 overflow-hidden rounded-card border border-[rgba(239,68,68,0.3)] bg-bg-surface">
      <div className="flex items-start justify-between px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-[22px] items-center rounded bg-[rgba(239,68,68,0.1)] px-2 text-[11px] font-medium text-[#ff8a8a]">
            ⚑ Dropped
          </span>
          <span className="text-xs text-text-secondary">{dateText}</span>
          {update.attempts != null && (
            <span className="text-xs text-text-tertiary">
              {formatNumber(update.attempts)} attempts
            </span>
          )}
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={onEdit}
            className="flex h-7 items-center gap-1 rounded-btn border border-border bg-white/5 px-2.5 text-xs text-text-secondary transition-colors hover:bg-bg-subtle"
          >
            <Pencil size={11} />
            Edit
          </button>
        )}
      </div>

      {update.notes && (
        <>
          <div className="mx-3.5 mt-3 h-px bg-[#242424]" />
          <div className="px-3.5 pb-3 pt-2.5">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[#666]">
              Reason for dropping
            </p>
            <p className="text-[13px] leading-snug text-[#c8c8c8]">
              {update.notes}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Timeline ────────────────────────────────────────────────────
interface TimelineProps {
  data: LevelPageData
  datePref: DateFormatPreference
  isOwner: boolean
  onEdit: (progressUpdateId: string) => void
}

export function Timeline({ data, datePref, isOwner, onEdit }: TimelineProps) {
  // Already newest-first from the API — completions, progress logs, and
  // drops are all ordinary progress_updates sharing one timeline.
  const updates = data.progressUpdates

  if (updates.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text-tertiary">
        No progress entries yet.
      </p>
    )
  }

  return (
    <div className="relative flex flex-col gap-2 py-2">
      {/* Vertical connector line */}
      <div
        className="pointer-events-none absolute bottom-4 left-[31px] top-4 w-0.5 -translate-x-1/2 bg-[#2a2a2a]"
        aria-hidden
      />

      {updates.map((update) => {
        const props = {
          key: update.progressUpdateId,
          update,
          datePref,
          isOwner,
          onEdit: () => onEdit(update.progressUpdateId),
        }
        if (update.kind === 'COMPLETION') return <CompletionEntry {...props} />
        if (update.kind === 'DROP') return <DropEntry {...props} />
        return <ProgressEntry {...props} />
      })}
    </div>
  )
}
