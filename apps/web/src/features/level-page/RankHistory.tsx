// The rank-history panel on the user's own level page — where this level has
// sat in their classic ranking, and what moved it.
//
// The user's OWN level page only. This is personal data and there is no
// cross-user equivalent, so the Global Level Page must never render it.
//
// Two views of one history. The chart answers "how has this moved" at a glance;
// the events list answers "what exactly happened, and when". The chart always
// draws the full history — hiding other levels' moves there would leave a line
// that jumps between the user's own moves with nothing explaining the gaps.

import { Loader2, Minus, MoveDown, MoveUp, Sparkles } from 'lucide-react'
import type { RankHistoryEntry } from '@infernolog/core'
import { Segmented } from '@/components/generic/segmented'
import { Switch } from '@/components/generic/switch'
import { cn } from '@/lib/utils'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import { RankHistoryChart } from './RankHistoryChart'
import {
  entryDate,
  entryLabel,
  milestoneText,
  positionText,
} from './rankHistoryContent'
import { useRankHistoryPanel, type RankHistoryTab } from './useRankHistoryPanel'

const TABS: { value: RankHistoryTab; label: string }[] = [
  { value: 'chart', label: 'Chart' },
  { value: 'events', label: 'Events' },
]

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p className="text-sm font-medium tabular-nums text-text-primary">
        {value}
      </p>
    </div>
  )
}

// An entry the user caused reads as an action; one caused by another level
// reads as something that happened to this one, and is set back accordingly.
function EntryRow({
  entry,
  datePref,
}: {
  entry: RankHistoryEntry
  datePref: DateFormatPreference
}) {
  const own = entry.kind === 'DIRECT'
  const milestone = milestoneText(entry)
  const before = entry.positionBefore
  const after = entry.positionAfter
  const Icon =
    after === null || (before !== null && after > before)
      ? MoveDown
      : before === null || after < before
        ? MoveUp
        : Minus

  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <Icon
        className={cn(
          'mt-0.5 h-3.5 w-3.5 shrink-0',
          own ? 'text-accent-hover' : 'text-text-tertiary'
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-xs',
            own ? 'text-text-primary' : 'text-text-secondary'
          )}
        >
          {entryLabel(entry)}
        </p>
        <p className="text-[10px] text-text-tertiary">
          {entryDate(entry, datePref)}
        </p>
        {milestone && (
          <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-accent-dim px-1.5 py-0.5 text-[10px] font-medium text-accent-hover">
            <Sparkles className="h-2.5 w-2.5" aria-hidden />
            {milestone}
          </span>
        )}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-text-tertiary">
        {positionText(before, 'before')}
        <span aria-hidden className="px-1">
          →
        </span>
        <span className="text-text-primary">
          {positionText(after, 'after')}
        </span>
      </span>
    </li>
  )
}

/**
 * This level's rank history, chart and events.
 *
 * @param levelId - GD level id.
 * @param enabled - False when the user has no entry for this level; the panel
 * still renders its empty state rather than requesting a history that cannot
 * exist.
 */
export function RankHistory({
  levelId,
  datePref,
  enabled = true,
}: {
  levelId: string
  datePref: DateFormatPreference
  enabled?: boolean
}) {
  const {
    isLoading,
    isError,
    isEmpty,
    entries,
    points,
    stats,
    tab,
    setTab,
    showOthers,
    setShowOthers,
    hiddenCount,
  } = useRankHistoryPanel(levelId, enabled)

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
      </div>
    )
  }

  if (isError) {
    return (
      <p className="py-6 text-center text-sm text-text-tertiary">
        Couldn&rsquo;t load this level&rsquo;s rank history.
      </p>
    )
  }

  if (isEmpty) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-text-secondary">Not on your demon list yet.</p>
        <p className="mt-1 text-xs text-text-tertiary">
          Place it from the Demon List tab and its history starts here.
        </p>
      </div>
    )
  }

  return (
    <div className="pt-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-5">
          <Stat
            label="Now"
            value={stats.current === null ? 'Unranked' : `#${stats.current}`}
          />
          <Stat
            label="Peak"
            value={stats.peak === null ? '—' : `#${stats.peak.position}`}
          />
          <Stat label="Moves" value={stats.moveCount} />
        </div>
        <Segmented
          options={TABS}
          value={tab}
          onChange={setTab}
          size="sm"
          fill={false}
          className="shrink-0"
        />
      </div>

      {tab === 'chart' ? (
        <div className="mt-3">
          <RankHistoryChart points={points} />
        </div>
      ) : (
        <>
          {hiddenCount > 0 && (
            <label className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
              <Switch
                checked={showOthers}
                onCheckedChange={setShowOthers}
                aria-label="Show other levels' moves"
              />
              Other levels&rsquo; moves
              <span className="text-text-tertiary">({hiddenCount})</span>
            </label>
          )}
          {entries.length === 0 ? (
            <p className="py-5 text-center text-xs text-text-tertiary">
              You haven&rsquo;t moved this level yourself.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border-subtle">
              {entries.map((entry) => (
                <EntryRow key={entry.id} entry={entry} datePref={datePref} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
