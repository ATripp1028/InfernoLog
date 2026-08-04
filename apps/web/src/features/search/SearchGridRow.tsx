import { Link } from '@tanstack/react-router'
import { DifficultyFace } from '@/components/DifficultyFace'
import { ThumbnailWash } from '@/features/ranking/ThumbnailWash'
import { formatNumber } from '@/features/logging/format'
import { gdStatIconSrc } from '@/lib/gdAssets'
import type { LevelBrowseResult } from '@/lib/levelSearchParams'

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-text-secondary" title={label}>
      <img src={icon} alt="" aria-hidden className="size-3.5 object-contain" />
      {value}
    </span>
  )
}

// A results-grid row: the level's thumbnail wash under its difficulty face, the
// load-bearing name + `creator · ID · difficulty` triple, and the
// user-independent stats (downloads / likes / length). Links to the level's
// Global Level Page.
export function SearchGridRow({ level }: { level: LevelBrowseResult }) {
  const difficulty = level.inGameDifficulty ?? 'Unrated'
  const likes = level.likes ?? 0
  // RobTop's official levels aren't online levels, so their download/like counts
  // are always 0 — hide those stats for them (same 'robtop' heuristic the Stats
  // card uses).
  const isRobtop = level.creator?.toLowerCase() === 'robtop'

  return (
    <Link
      to="/levels/$levelId"
      params={{ levelId: level.inGameId }}
      className="group relative flex items-center gap-3 overflow-hidden rounded-card border border-border-subtle px-3 py-2.5 transition-colors"
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
      </span>

      <span className="relative z-10 hidden shrink-0 items-center gap-3 text-xs sm:flex">
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
          <Stat icon={gdStatIconSrc.length} label="Length" value={level.length} />
        )}
      </span>
    </Link>
  )
}
