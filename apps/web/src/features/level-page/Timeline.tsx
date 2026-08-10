import { ExternalLink, Film, Pencil, Trash2 } from 'lucide-react'
import { formatNumber } from '@/features/logging/format'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import type { LevelPageData, ProgressUpdate } from './types'
import { formatEntryDate, rangeLabel } from './timelineFormat'
import { SectionLabel } from '@/components/inputs/SectionLabel'

function EntryTimeSuffix({
  timeText,
  zoneSuffix,
}: {
  timeText: string | null
  zoneSuffix: string | null
}) {
  if (!timeText) return null
  return (
    <span className="text-[10px] text-text-tertiary">
      {' '}
      {timeText}
      {zoneSuffix ? ` ${zoneSuffix}` : ''}
    </span>
  )
}

// ─── Completion entry card ────────────────────────────────────────
function CompletionEntry({
  update,
  datePref,
  isOwner,
  onEdit,
  onDelete,
}: {
  update: ProgressUpdate
  datePref: DateFormatPreference
  isOwner: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const {
    text: dateText,
    timeText,
    zoneSuffix,
    uncertain,
  } = formatEntryDate(
    update.date,
    update.dateTimezone,
    update.loggedAt,
    update.dateUncertain,
    datePref
  )

  return (
    <div className="relative ml-8 overflow-hidden rounded-card border border-success/35 bg-bg-surface">
      <div className="flex items-start justify-between px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-[22px] items-center rounded bg-success-dim px-2 text-[11px] font-medium text-success-soft">
            🏆 Completion
          </span>
          <span className="text-[13px] font-medium text-text-primary">
            100%
          </span>
          <span className="text-xs text-text-secondary">
            {uncertain ? '~' : ''}
            {dateText}
            <EntryTimeSuffix timeText={timeText} zoneSuffix={zoneSuffix} />
          </span>
        </div>
        {isOwner && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              className="flex h-7 items-center gap-1 rounded-btn border border-border bg-white/5 px-2.5 text-xs text-text-secondary transition-colors hover:bg-bg-subtle"
            >
              <Pencil size={11} />
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete entry"
              className="flex h-7 items-center justify-center rounded-btn border border-border bg-white/5 px-2 text-text-secondary transition-colors hover:bg-bg-subtle hover:text-danger"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {update.notes && (
        <>
          <div className="mx-3.5 mt-3 h-px bg-border-subtle" />
          <div className="px-3.5 pb-2 pt-2.5">
            <SectionLabel size="xs" className="mb-1.5">
              Notes on this run
            </SectionLabel>
            <p className="text-[13px] leading-snug text-text-body">
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
              className="inline-flex h-[22px] items-center gap-1 rounded bg-primary-dim px-2 text-[11px] font-medium text-primary-soft hover:opacity-80"
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
  onDelete,
}: {
  update: ProgressUpdate
  datePref: DateFormatPreference
  isOwner: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const {
    text: dateText,
    timeText,
    zoneSuffix,
  } = formatEntryDate(
    update.date,
    update.dateTimezone,
    update.loggedAt,
    update.dateUncertain,
    datePref
  )

  const label = rangeLabel(update)
  const hasExtra =
    update.notes || update.highlightUrl || update.videoUrl || update.onStream

  return (
    <div className="relative ml-8 overflow-hidden rounded-card border border-border-subtle bg-bg-inset">
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
            <EntryTimeSuffix timeText={timeText} zoneSuffix={zoneSuffix} />
          </span>
          {update.attempts != null && (
            <span className="text-xs text-text-tertiary">
              {formatNumber(update.attempts)} attempts
            </span>
          )}
        </div>
        {isOwner && (
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit entry"
              className="text-sm text-text-tertiary transition-colors hover:text-text-secondary"
            >
              ✎
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete entry"
              className="text-text-tertiary transition-colors hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {update.notes && (
        <>
          <div className="mx-3.5 mt-2 h-px bg-border-subtle" />
          <div className="px-3.5 pb-2 pt-2.5">
            <SectionLabel size="xs" className="mb-1.5">
              Notes on this run
            </SectionLabel>
            <p className="text-[13px] leading-snug text-text-body">
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
              className="inline-flex h-[22px] items-center gap-1 rounded bg-primary-dim px-2 text-[11px] font-medium text-primary-soft hover:opacity-80"
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
  onDelete,
}: {
  update: ProgressUpdate
  datePref: DateFormatPreference
  isOwner: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const {
    text: dateText,
    timeText,
    zoneSuffix,
  } = formatEntryDate(
    update.date,
    update.dateTimezone,
    update.loggedAt,
    update.dateUncertain,
    datePref
  )

  return (
    <div className="relative ml-8 overflow-hidden rounded-card border border-danger/30 bg-bg-surface">
      <div className="flex items-start justify-between px-3.5 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-[22px] items-center rounded bg-danger-dim px-2 text-[11px] font-medium text-danger-soft">
            ⚑ Dropped
          </span>
          <span className="text-xs text-text-secondary">
            {dateText}
            <EntryTimeSuffix timeText={timeText} zoneSuffix={zoneSuffix} />
          </span>
          {update.attempts != null && (
            <span className="text-xs text-text-tertiary">
              {formatNumber(update.attempts)} attempts
            </span>
          )}
        </div>
        {isOwner && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              className="flex h-7 items-center gap-1 rounded-btn border border-border bg-white/5 px-2.5 text-xs text-text-secondary transition-colors hover:bg-bg-subtle"
            >
              <Pencil size={11} />
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete entry"
              className="flex h-7 items-center justify-center rounded-btn border border-border bg-white/5 px-2 text-text-secondary transition-colors hover:bg-bg-subtle hover:text-danger"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {update.notes && (
        <>
          <div className="mx-3.5 mt-3 h-px bg-border-subtle" />
          <div className="px-3.5 pb-3 pt-2.5">
            <SectionLabel size="xs" className="mb-1.5">
              Reason for dropping
            </SectionLabel>
            <p className="text-[13px] leading-snug text-text-body">
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
  onDelete: (progressUpdateId: string) => void
}

/**
 * Every logged update in reverse chronological order, with the completion styled apart.
 */
export function Timeline({
  data,
  datePref,
  isOwner,
  onEdit,
  onDelete,
}: TimelineProps) {
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
        className="pointer-events-none absolute bottom-4 left-[31px] top-4 w-0.5 -translate-x-1/2 bg-bg-subtle"
        aria-hidden
      />

      {updates.map((update) => {
        const props = {
          key: update.progressUpdateId,
          update,
          datePref,
          isOwner,
          onEdit: () => onEdit(update.progressUpdateId),
          onDelete: () => onDelete(update.progressUpdateId),
        }
        if (update.kind === 'COMPLETION') return <CompletionEntry {...props} />
        if (update.kind === 'DROP') return <DropEntry {...props} />
        return <ProgressEntry {...props} />
      })}
    </div>
  )
}
