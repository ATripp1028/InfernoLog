import { Link, useLocation } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import { ThumbnailWash } from '@/components/data/ThumbnailWash'
import { backOriginState } from '@/lib/backOrigin'
import { ratingColor } from '@/lib/ratingColor'
import { formatRating } from '@/lib/ratingScale'
import type { RatingDisplayScale } from '@/lib/api/wireEnums'
import {
  ACTION_WIDTH,
  CATEGORY_COLUMNS_AT,
  FACE_SIZE,
  OVERALL_WIDTH,
  SCORE_WIDTH,
} from './columns'
import { RowEditor } from './RowEditor'
import { rowDomId } from './useRankingPage'
import type { RankedEntry } from './rankingModel'
import type { RatingCategory } from '@/lib/api/me'
import type { RatingEdit } from '@/lib/api/ranking'
import type { OverallRatingConfig } from '@infernolog/core'

interface RankedRowProps {
  entry: RankedEntry
  scale: RatingDisplayScale
  config: OverallRatingConfig
  categories: RatingCategory[]
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
  scale,
  config,
  categories,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
}: RankedRowProps) {
  const { rank, item } = entry
  const { level, overallRating } = item
  const location = useLocation()

  return (
    <div
      id={rowDomId(level.inGameId)}
      className={`group relative overflow-hidden rounded-card border bg-bg-surface ${
        editing
          ? 'border-primary p-3'
          : 'h-[72px] border-border-subtle'
      }`}
    >
      {!editing && <ThumbnailWash levelId={level.inGameId} />}
      {editing ? (
        <div className="relative z-10 flex flex-col gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text-primary">
              #{rank} — {level.name ?? `Level #${level.inGameId}`}
            </div>
            <div className="truncate text-xs text-text-secondary">
              {level.creator ? `Published by ${level.creator}` : 'Unknown creator'}
            </div>
          </div>
          <RowEditor
            levelId={level.inGameId}
            scale={scale}
            config={config}
            categories={categories}
            overallRating={overallRating}
            ratingScores={item.ratingScores}
            onSave={onSave}
            onCancel={onCancel}
            saving={saving}
          />
        </div>
      ) : (
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
            size={FACE_SIZE}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-semibold text-text-primary"
              style={{ color: ratingColor(overallRating) }}
            >
              #{rank} — {level.name ?? `Level #${level.inGameId}`}
            </div>
            <div className="truncate text-xs text-text-secondary">
              {level.creator
                ? `Published by ${level.creator}`
                : 'Unknown creator'}
            </div>
          </div>
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
              style={{ color: ratingColor(score ?? null) }}
            >
              {score == null ? '—' : formatRating(score, scale)}
            </span>
          )
        })}

        {/* The rating is what earned the position, so it reads as the row's
            headline figure rather than as one more badge. */}
        <span
          title="Rating"
          className={`${OVERALL_WIDTH} shrink-0 text-center text-lg font-semibold tabular-nums text-text-primary`}
          style={{ color: ratingColor(overallRating) }}
        >
          {overallRating == null ? '—' : formatRating(overallRating, scale)}
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
      </div>
      )}
    </div>
  )
}
