import { Link, useLocation } from '@tanstack/react-router'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import { GddlTierBadge } from '@/components/data/GddlTierBadge'
import { ThumbnailWash } from '@/components/data/ThumbnailWash'
import { backOriginState } from '@/lib/backOrigin'
import { medalColor } from '@/lib/medals'
import { formatRating } from '@/lib/ratingScale'
import type { RatingDisplayScale } from '@/lib/api/wireEnums'
import type { RankedEntry } from './rankingModel'

interface RankedRowProps {
  entry: RankedEntry
  scale: RatingDisplayScale
}

/**
 * One numbered row of the Ranking page: a level, its position, and the rating
 * that put it there.
 *
 * Deliberately shaped like the demon list's row — same height, same thumbnail
 * wash, same medal colours on the podium — because the two are the same kind of
 * list ordered on different axes, and a user moving between them should not
 * have to re-learn the row.
 */
export function RankedRow({ entry, scale }: RankedRowProps) {
  const { rank, item } = entry
  const { level, overallRating } = item
  const location = useLocation()

  return (
    <div className="group relative h-[72px] overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
      <ThumbnailWash levelId={level.inGameId} />
      <div className="relative z-10 flex h-full items-center gap-3 px-2">
        <Link
          to="/log/$levelId"
          params={{ levelId: level.inGameId }}
          state={backOriginState(location.href)}
          className="flex min-w-0 flex-1 items-center gap-3 self-stretch"
        >
          <DifficultyFace
            difficulty={level.inGameDifficulty}
            featured={level.featured}
            epicValue={level.epicValue}
            rated={level.isRated}
            size={80}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-semibold text-text-primary"
              style={{ color: medalColor(rank) }}
            >
              #{rank} — {level.name ?? `Level #${level.inGameId}`}
            </div>
            <div className="truncate text-xs text-text-secondary">
              {level.creator
                ? `Published by ${level.creator}`
                : 'Unknown creator'}
            </div>
          </div>
          {/* The rating is what earned the position, so it reads as the row's
              headline figure rather than as one more badge. */}
          {overallRating != null && (
            <span
              title="Rating"
              className="shrink-0 text-lg font-semibold tabular-nums text-text-primary"
            >
              {formatRating(overallRating, scale)}
            </span>
          )}
          <GddlTierBadge tier={item.userGddlTier ?? null} variant="inline" />
        </Link>
      </div>
    </div>
  )
}
