import { Link, useLocation } from '@tanstack/react-router'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import { SheetSourceChip, TierBadge } from '@/components/data/TierBadge'
import { ThumbnailWash } from '@/components/data/ThumbnailWash'
import { formatNumber } from '@/lib/numberFormat'
import { gdStatIconSrc, difficultyLabel } from '@/lib/gdAssets'
import { backOriginState } from '@/lib/backOrigin'
import type { LevelBrowseResult } from '@/lib/levelSearchParams'
import { rowStats, type RowStat, type RowStatKey } from './rowStats'

function Stat({
  icon,
  label,
  value,
}: {
  icon: string
  label: string
  value: string
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-text-secondary"
      title={label}
    >
      <img src={icon} alt="" aria-hidden className="size-3.5 object-contain" />
      {value}
    </span>
  )
}

// A figure the current sort or filters asked for (see rowStats): a list
// placement as its painted badge beside the list's icon, or a labelled value.
// Unknown values show a dash, since under a sort by them that blank is why the
// row sits where it does.
function ContextStat({ stat }: { stat: RowStat }) {
  if (stat.kind === 'tier') {
    return (
      <span className="inline-flex items-center gap-1.5" title={stat.label}>
        <img
          src={stat.icon}
          alt=""
          aria-hidden
          className="size-3.5 shrink-0 object-contain"
        />
        <span className="sr-only">{stat.label}:</span>
        <TierBadge
          look={stat.look}
          className="min-w-0 px-1.5 py-0.5 text-[11px]"
        />
        {stat.source && <SheetSourceChip source={stat.source} />}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1" title={stat.label}>
      <span className="text-text-tertiary">{stat.label}</span>
      <span
        className={
          stat.value === null ? 'text-text-tertiary' : 'text-text-primary'
        }
      >
        {stat.value ?? '—'}
      </span>
    </span>
  )
}

/**
 * A results-grid row: the level's thumbnail wash under its difficulty face, the
 * load-bearing name + `creator · ID · difficulty` triple, and on the right the
 * user-independent stats (downloads / likes / length), led by whatever the
 * search is sorted or filtered by. On mobile, where the right side is hidden,
 * those sort/filter figures move under the title instead. Links to the level's
 * Global Level Page.
 */
export function SearchGridRow({
  level,
  statKeys,
}: {
  level: LevelBrowseResult
  statKeys: RowStatKey[]
}) {
  const difficulty = difficultyLabel(level)
  const likes = level.likes ?? 0
  // RobTop's official levels aren't online levels, so their download/like counts
  // are always 0 — hide those stats for them (same 'robtop' heuristic the Stats
  // card uses).
  const isRobtop = level.creator?.toLowerCase() === 'robtop'
  const stats = rowStats(level, statKeys)
  const location = useLocation()

  return (
    <Link
      to="/levels/$levelId"
      params={{ levelId: level.inGameId }}
      state={backOriginState(location.href)}
      className="group relative flex items-center gap-3 overflow-hidden rounded-card border border-border-subtle pr-3 transition-colors"
    >
      <ThumbnailWash levelId={level.inGameId} variant="row" />
      <span
        aria-hidden
        className="absolute inset-0 bg-white/0 transition-colors group-hover:bg-white/[0.04]"
      />

      <DifficultyFace
        difficulty={level.inGameDifficulty}
        featured={level.featured}
        epicValue={level.epicValue}
        rated={level.isRated}
        size={88}
        className="relative z-10"
      />

      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-tight text-text-primary">
          {level.name ?? `Level #${level.inGameId}`}
        </span>
        <span className="block truncate text-xs text-text-secondary">
          by {level.creator ?? 'Unknown'} · {level.inGameId} · {difficulty}
        </span>
        {stats.length > 0 && (
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:hidden">
            {stats.map((stat) => (
              <ContextStat key={stat.key} stat={stat} />
            ))}
          </span>
        )}
      </span>

      <span className="relative z-10 hidden max-w-[60%] shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs sm:flex">
        {stats.map((stat) => (
          <ContextStat key={stat.key} stat={stat} />
        ))}
        {stats.length > 0 && (
          <span aria-hidden className="h-4 w-px bg-border-subtle" />
        )}
        {!isRobtop && (
          <>
            <Stat
              icon={gdStatIconSrc.download}
              label="Downloads"
              value={formatNumber(level.downloads ?? 0)}
            />
            <Stat
              icon={likes < 0 ? gdStatIconSrc.dislike : gdStatIconSrc.like}
              label={likes < 0 ? 'Dislikes' : 'Likes'}
              value={formatNumber(Math.abs(likes))}
            />
          </>
        )}
        {level.length && (
          <Stat
            icon={gdStatIconSrc.length}
            label="Length"
            value={level.length}
          />
        )}
      </span>
    </Link>
  )
}
