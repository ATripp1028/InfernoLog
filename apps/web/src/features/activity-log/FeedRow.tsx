// One row of the Log page's feed.
//
// Both tables the feed merges land here: an activity_log event and a
// progress_updates row render as the same kind of line, because from the user's
// side they are the same kind of fact — a thing they did, at a time. Which
// table a row came from is an implementation detail and never shown.
//
// A row that has more to say expands in place rather than navigating: the field
// diffs behind an edit and the levels behind an import are detail on the same
// entry, not a separate page.

import { memo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ChevronDown,
  ListOrdered,
  Pencil,
  Settings2,
  Trophy,
  TrendingDown,
  TrendingUp,
  Undo2,
  FileSpreadsheet,
  type LucideIcon,
} from 'lucide-react'
import type {
  ActivityFeedEvent,
  ActivityFeedItem,
  ActivityFeedProgress,
} from '@infernolog/core'
import { cn } from '@/lib/utils'
import type { RatingCategory } from '@/lib/api/me'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import {
  attemptsLabel,
  bulkReplaceSummary,
  editSummary,
  eventTone,
  milestoneLabel,
  positionLabel,
  progressReach,
  progressVerb,
  ratingRankHeadline,
  recordedTime,
  type FeedTone,
} from './feedContent'
import { configSummary, type FieldValueContext } from './fieldLabels'
import { ConfigDetail, EditDetail, ImpactDetail } from './FeedDetails'

const TONE_CLASSES: Record<FeedTone, string> = {
  ranking: 'bg-accent-dim text-accent-hover',
  edit: 'bg-info-dim text-info-soft',
  settings: 'bg-bg-subtle text-text-secondary',
  success: 'bg-success-dim text-success-soft',
  danger: 'bg-danger-dim text-danger-soft',
  neutral: 'bg-bg-subtle text-text-secondary',
}

export interface FeedRowContext extends FieldValueContext {
  datePref: DateFormatPreference
  categories: RatingCategory[]
}

/** The level name, linked to that level's page when the id is still known. */
function LevelName({
  levelId,
  levelName,
}: {
  levelId: string | null
  levelName: string | null
}) {
  const label = levelName ?? levelId ?? 'a level'
  if (!levelId) return <span className="font-medium">{label}</span>
  return (
    <Link
      to="/list/$levelId"
      params={{ levelId }}
      className="font-medium text-text-primary hover:text-primary"
    >
      {label}
    </Link>
  )
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: FeedTone
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center rounded px-1.5 text-[10px] font-medium',
        TONE_CLASSES[tone]
      )}
    >
      {children}
    </span>
  )
}

// The shared frame: icon gutter, sentence, optional detail, time on the right.
function Row({
  icon: Icon,
  tone,
  headline,
  meta,
  badge,
  time,
  detail,
}: {
  icon: LucideIcon
  tone: FeedTone
  headline: React.ReactNode
  meta?: React.ReactNode
  badge?: React.ReactNode
  time: string
  detail?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-card border border-border-subtle bg-bg-surface">
      <div className="flex items-start gap-3 px-3.5 py-2.5">
        <span
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            TONE_CLASSES[tone]
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-body">
            {headline}
            {badge}
          </div>
          {meta && (
            <div className="mt-0.5 text-xs text-text-secondary">{meta}</div>
          )}
          {detail && open && (
            <div className="mt-2.5 border-t border-border-subtle pt-2.5">
              {detail}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] tabular-nums text-text-tertiary">
            {time}
          </span>
          {detail && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? 'Hide details' : 'Show details'}
              className="rounded p-0.5 text-text-tertiary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform',
                  open && 'rotate-180'
                )}
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ProgressRow({
  item,
  context,
}: {
  item: ActivityFeedProgress
  context: FeedRowContext
}) {
  const { verb, tone } = progressVerb(item.kind)
  const reach = progressReach(item)
  const attempts = attemptsLabel(item.attempts)
  const icon =
    item.kind === 'COMPLETION'
      ? Trophy
      : item.kind === 'DROP'
        ? Undo2
        : TrendingUp

  return (
    <Row
      icon={icon}
      tone={tone}
      time={recordedTime(item.recordedAt, context.datePref)}
      headline={
        <span>
          <span className="font-medium text-text-primary">{verb}</span>{' '}
          {item.kind === 'PROGRESS' && reach ? (
            <>
              <span className="text-text-primary">{reach}</span> on{' '}
            </>
          ) : null}
          <LevelName levelId={item.levelId} levelName={item.levelName} />
        </span>
      }
      meta={[item.kind === 'PROGRESS' ? null : reach, attempts]
        .filter(Boolean)
        .join(' · ')}
    />
  )
}

// The icon and sentence for each user-facing event type. RANKING_REBALANCE has
// no case because it is excluded server-side and can never arrive.
function EventRow({
  event,
  context,
}: {
  event: ActivityFeedEvent
  context: FeedRowContext
}) {
  const tone = eventTone(event)
  const time = recordedTime(event.recordedAt, context.datePref)
  const own = event.levelImpacts.find((i) => i.levelId === event.levelId)
  const milestone = own
    ? milestoneLabel(
        own.milestoneCrossed,
        own.positionBefore,
        own.positionAfter
      )
    : null
  const badge = milestone ? (
    <Badge tone="ranking">{milestone}</Badge>
  ) : undefined
  const level = (
    <LevelName levelId={event.levelId} levelName={event.levelName} />
  )
  const move = own
    ? `${positionLabel(own.positionBefore)} → ${positionLabel(own.positionAfter)}`
    : undefined

  switch (event.eventType) {
    case 'RANKING_PLACEMENT':
      return (
        <Row
          icon={ListOrdered}
          tone={tone}
          time={time}
          badge={badge}
          headline={
            <span>
              <span className="font-medium text-text-primary">Placed</span>{' '}
              {level} in your ranking
            </span>
          }
          meta={move}
        />
      )
    case 'RANKING_REORDER': {
      const up =
        own?.positionAfter !== null &&
        own?.positionBefore !== null &&
        (own?.positionAfter ?? 0) < (own?.positionBefore ?? 0)
      return (
        <Row
          icon={up ? TrendingUp : TrendingDown}
          tone={tone}
          time={time}
          badge={badge}
          headline={
            <span>
              <span className="font-medium text-text-primary">Moved</span>{' '}
              {level} {up ? 'up' : 'down'} your ranking
            </span>
          }
          meta={move}
        />
      )
    }
    case 'RANKING_UNRANKED':
      return (
        <Row
          icon={Undo2}
          tone={tone}
          time={time}
          badge={badge}
          headline={
            <span>
              <span className="font-medium text-text-primary">Removed</span>{' '}
              {level} from your ranking
            </span>
          }
          meta={move}
        />
      )
    case 'RANKING_BULK_REPLACE':
      return (
        <Row
          icon={FileSpreadsheet}
          tone={tone}
          time={time}
          headline={
            <span>
              <span className="font-medium text-text-primary">
                A spreadsheet import
              </span>{' '}
              replaced your ranking
            </span>
          }
          meta={bulkReplaceSummary(event)}
          detail={<ImpactDetail event={event} />}
        />
      )
    case 'LOG_EDIT': {
      const headline = ratingRankHeadline(event)
      return (
        <Row
          icon={Pencil}
          tone={tone}
          time={time}
          badge={headline ? <Badge tone="edit">{headline}</Badge> : undefined}
          headline={
            <span>
              <span className="font-medium text-text-primary">
                Edited your log for
              </span>{' '}
              {level}
            </span>
          }
          meta={editSummary(event)}
          detail={
            <EditDetail
              event={event}
              categories={context.categories}
              context={context}
            />
          }
        />
      )
    }
    case 'RATING_CONFIG_CHANGE':
      return (
        <Row
          icon={Settings2}
          tone={tone}
          time={time}
          headline={
            <span>
              <span className="font-medium text-text-primary">
                Changed your
              </span>{' '}
              rating setup
            </span>
          }
          meta={configSummary(event.fieldChanges)}
          detail={
            <ConfigDetail
              changes={event.fieldChanges}
              categories={context.categories}
              context={context}
            />
          }
        />
      )
  }
}

/**
 * One feed entry, whichever table it came from.
 *
 * Memoised: a page holds thirty of these, each with its own expand state, and
 * every filter change would otherwise re-render all of them. `context` is
 * memoised by the page for the same reason.
 *
 * @param context - The viewer's display preferences plus their current rating
 * categories, which per-category score rows are resolved against by id.
 */
export const FeedRow = memo(function FeedRow({
  item,
  context,
}: {
  item: ActivityFeedItem
  context: FeedRowContext
}) {
  return item.source === 'PROGRESS' ? (
    <ProgressRow item={item} context={context} />
  ) : (
    <EventRow event={item} context={context} />
  )
})
