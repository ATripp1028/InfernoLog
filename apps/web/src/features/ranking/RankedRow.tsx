import { Link, useLocation } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'
import { ThumbnailWash } from '@/components/data/ThumbnailWash'
import { backOriginState } from '@/lib/backOrigin'
import { overallColor, scoreColor } from '@/lib/ratingColor'
import { formatRating } from '@/lib/ratingScale'
import type { RatingDisplayScale } from '@/lib/api/wireEnums'
import {
  ACTION_WIDTH,
  CATEGORY_COLUMNS_AT,
  OVERALL_WIDTH,
  SCORE_WIDTH,
} from './columns'
import { LevelIdentity } from './LevelIdentity'
import { RowEditor } from './RowEditor'
import { rowDomId } from './useRankingPage'
import type { RankedEntry } from './rankingModel'
import type { RatingCategory } from '@/lib/api/me'
import type { RatingEdit } from '@/lib/api/ranking'
import type { OverallRatingConfig } from '@infernolog/core'

interface RankedRowProps {
  entry: RankedEntry
  /** The lowest position in the ranking, for the bottom-of-the-list colour. */
  lastRank: number
  scale: RatingDisplayScale
  config: OverallRatingConfig
  categories: RatingCategory[]
  /**
   * Whether this mode has a rating number to show. False in MANUAL, where the
   * POSITION is the rating — an Overall column would be a row of em dashes, and
   * an edit button would open a form with nothing in it.
   */
  showRating: boolean
  editing: boolean
  onEdit: (levelId: string) => void
  onCancel: () => void
  onSave: (edit: RatingEdit) => void
  saving: boolean
}

/**
 * One numbered row of the Ranking page: a level, its position, and the rating
 * that put it there.
 *
 * Deliberately shaped like the demon list's row — same height, same thumbnail
 * wash — because the two are the same kind of list ordered on different axes,
 * and a user moving between them should not have to re-learn the row.
 *
 * Where they part company is colour. The demon list tints the top few names by
 * rank (gold, silver, bronze); here every rating-bearing figure is tinted by
 * the rating itself, on the red-white-green scale a spreadsheet would give it —
 * see `lib/ratingColor`. Rank is already spelled out as a number, so colour is
 * free to carry the thing the number cannot.
 */
export function RankedRow({
  entry,
  lastRank,
  scale,
  config,
  categories,
  showRating,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
}: RankedRowProps) {
  const { rank, item } = entry
  const { level, overallRating } = item
  const location = useLocation()

  // The name carries the same colour as the overall rating it is tinted by —
  // they are the same figure, and disagreeing would read as a bug.
  const overall = overallColor(overallRating, rank, lastRank)

  return (
    <div
      id={rowDomId(level.inGameId)}
      className={`group relative overflow-hidden rounded-card border bg-bg-surface ${
        // No padding here in either mode: the row's inner container and the
        // editor's form each supply their own, and doubling it would shift the
        // columns sideways the moment the editor opened.
        editing ? 'border-primary' : 'h-[72px] border-border-subtle'
      }`}
    >
      <ThumbnailWash levelId={level.inGameId} />
      {editing ? (
        <RowEditor
          levelId={level.inGameId}
          identity={
            <LevelIdentity rank={rank} level={level} nameColor={overall} />
          }
          scale={scale}
          config={config}
          categories={categories}
          overallRating={overallRating}
          ratingScores={item.ratingScores}
          enjoyment={item.entry?.enjoyment ?? null}
          onSave={onSave}
          onCancel={onCancel}
          saving={saving}
        />
      ) : (
        <div className="relative z-10 flex h-full items-center gap-3 px-2">
          <Link
            to="/log/$levelId"
            params={{ levelId: level.inGameId }}
            state={backOriginState(location.href)}
            className="flex min-w-0 flex-1 items-center gap-3 self-stretch"
          >
            <LevelIdentity rank={rank} level={level} nameColor={overall} />
          </Link>

          {/* Per-category breakdown, in the user's priority order — the same
            order the ranking breaks ties in. WEIGHTED mode only; in SIMPLE the
            scores exist but carry no meaning. */}
          {categories.map((category) => {
            const score = item.ratingScores.find(
              (s) => s.categoryId === category.id
            )?.score
            return (
              <span
                key={category.id}
                className={`${CATEGORY_COLUMNS_AT} ${SCORE_WIDTH} shrink-0 justify-center text-center text-sm tabular-nums text-text-secondary`}
                style={{ color: scoreColor(score ?? null) }}
              >
                {score == null ? '—' : formatRating(score, scale)}
              </span>
            )
          })}

          {/* The rating is what earned the position, so it reads as the row's
            headline figure rather than as one more badge. Both this and the
            edit button are absent in MANUAL: there is no number there, and a
            column of em dashes beside a form with nothing in it explains
            nothing. */}
          {showRating && (
            <>
              <span
                title="Rating"
                className={`${OVERALL_WIDTH} shrink-0 text-center text-lg font-semibold tabular-nums text-text-primary`}
                style={{ color: overall }}
              >
                {overallRating == null
                  ? '—'
                  : formatRating(overallRating, scale)}
              </span>
              <button
                type="button"
                onClick={() => onEdit(level.inGameId)}
                aria-label={`Edit rating for ${level.name ?? `Level #${level.inGameId}`}`}
                title="Edit rating"
                className={`${ACTION_WIDTH} flex h-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-subtle hover:text-text-primary`}
              >
                <Pencil size={14} />
              </button>
            </>
          )}
        </div>
      )}
      {/* The demon list's hover treatment, matched deliberately: an inset warm
          glow rather than a background change, so the thumbnail underneath
          still reads. Suppressed while editing, where the row is already
          outlined and a hover glow would just be noise. */}
      {!editing && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ boxShadow: 'inset 0 0 40px rgba(255, 159, 28, 0.22)' }}
        />
      )}
    </div>
  )
}
