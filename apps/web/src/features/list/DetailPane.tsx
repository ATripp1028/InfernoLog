import { ArrowLeft, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import type { RatingDisplayScale, DateFormatPreference } from '@/lib/api/me'
import { Button } from '@/components/ui/button'
import { DifficultyFace } from '@/components/DifficultyFace'
import { formatRating, formatNumber } from '@/features/logging/format'
import { formatDate } from '@/lib/dateFormat'
import { gddlTier } from './filtering'
import { CopyableId } from './CopyableId'
import { TierBadge } from './TierBadge'
import type { ListItem } from './types'

const STATUS_LABEL: Record<ListItem['status'], string> = {
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In Progress',
  DROPPED: 'Dropped',
}

// Mobile detail pane for a selected level: metadata, the logged stats, list-tier
// references, record acceptances, and Edit/Delete. Renders from the already-
// fetched ListItem (no extra fetch). Progress history lives in Time Machine.
export function DetailPane({
  item,
  scale,
  datePref,
  onBack,
  onEdit,
  onDelete,
}: {
  item: ListItem
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { level, entry } = item

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to list"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="truncate text-sm font-semibold text-text-primary">
          {level.name ?? 'Unknown level'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center gap-3">
          <DifficultyFace
            difficulty={level.inGameDifficulty}
            featured={level.featured}
            epicValue={level.epicValue}
            rated={level.isRated}
            size={56}
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-text-primary">
              {level.name ?? 'Unknown level'}
            </p>
            <p className="truncate text-sm text-text-secondary">
              by {level.creator ?? 'Unknown'} ·{' '}
              <CopyableId id={level.inGameId} />
            </p>
            <span className="mt-1 inline-block rounded-full bg-[var(--color-bg-elevated)] px-2 py-0.5 text-xs text-text-secondary">
              {STATUS_LABEL[item.status]}
            </span>
          </div>
        </div>

        {/* Logged stats */}
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <Stat
            label="Date"
            value={
              entry?.date
                ? `${formatDate(entry.date, datePref)}${entry.dateUncertain ? ' ?' : ''}`
                : '—'
            }
          />
          <Stat
            label="Attempts"
            value={entry?.attempts != null ? formatNumber(entry.attempts) : '—'}
          />
          <Stat
            label="Rating"
            value={
              entry?.overallRating != null
                ? formatRating(entry.overallRating, scale)
                : '—'
            }
          />
          <Stat
            label="Enjoyment"
            value={
              entry?.enjoyment != null ? formatRating(entry.enjoyment, scale) : '—'
            }
          />
          {item.worstFail != null && (
            <Stat label="Worst fail" value={`${item.worstFail}%`} />
          )}
          {entry?.fps != null && <Stat label="FPS" value={String(entry.fps)} />}
          {entry?.difficultyOpinion && (
            <Stat label="Your opinion" value={entry.difficultyOpinion} />
          )}
        </dl>

        {entry?.notes && (
          <div className="mt-4">
            <p className="text-xs font-medium text-text-secondary">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">
              {entry.notes}
            </p>
          </div>
        )}

        {entry?.videoUrl && (
          <a
            href={entry.videoUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary"
          >
            <ExternalLink size={14} /> Watch video
          </a>
        )}

        {/* List references */}
        {entry && entry.listReferences.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium text-text-secondary">
              List references
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              {entry.listReferences.map((ref) => (
                <div key={ref.listSource} className="flex items-center gap-1.5">
                  {ref.listSource === 'GDDL' ? (
                    <TierBadge tier={gddlTier(item)} />
                  ) : (
                    <span className="rounded bg-[var(--color-bg-subtle)] px-2 py-1 text-xs font-semibold text-text-primary">
                      {ref.tierOrRank}
                    </span>
                  )}
                  <span className="text-xs text-text-tertiary">
                    {ref.listSource}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Record acceptances */}
        {entry && entry.recordAcceptances.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium text-text-secondary">
              Record acceptances
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {entry.recordAcceptances.map((acc) => (
                <div
                  key={acc.listSource}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-text-primary">{acc.listSource}</span>
                  <span
                    className={
                      acc.isAccepted ? 'text-success' : 'text-text-tertiary'
                    }
                  >
                    {acc.isAccepted ? 'Accepted' : 'Not accepted'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-[var(--color-border-subtle)] p-3">
        <Button variant="outline" className="flex-1" onClick={onEdit}>
          <Pencil size={15} /> Edit
        </Button>
        <Button variant="destructive" className="flex-1" onClick={onDelete}>
          <Trash2 size={15} /> Delete
        </Button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--color-bg-elevated)] px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-text-tertiary">
        {label}
      </dt>
      <dd className="text-sm font-semibold text-text-primary">{value}</dd>
    </div>
  )
}
