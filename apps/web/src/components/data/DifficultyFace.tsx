import { cn } from '@/lib/utils'
import {
  difficultyFaceSrc,
  levelGlowSrc,
  ratedStarSrc,
  showsRatedStar,
} from '@/lib/gdAssets'
import {
  faceScale,
  glowOffset,
  glowScale,
  ratedStarPlacement,
} from './faceGeometry'

interface DifficultyFaceProps {
  /** In-game difficulty label, e.g. "Extreme Demon" / "Insane" / "Auto". */
  difficulty: string | null
  /** Whether the level is featured (drives the feature-circle glow). */
  featured?: boolean | null
  /** Epic rating: 0 none, 1 epic, 2 legendary, 3 mythic — outranks featured. */
  epicValue?: number | null
  /**
   * Whether the level is rated (has stars). Adds the corner star on standard
   * Easy…Insane faces so a rated level reads differently from an unrated one
   * with the same face. No effect on demons/autos/NA.
   */
  rated?: boolean | null
  /** Box size in px (the glow fills it; the face is inset). Default 36. */
  size?: number
  className?: string
}

/**
 * The canonical way to render a GD difficulty face with its showcase glow
 * (feature circle / epic / legendary / mythic fire) behind it. Reused anywhere
 * a level's difficulty is shown — search results, the logging header, lists,
 * rankings, etc.
 */
export function DifficultyFace({
  difficulty,
  featured,
  epicValue,
  rated,
  size = 70,
  className,
}: DifficultyFaceProps) {
  const glow = levelGlowSrc(epicValue, featured)
  const showStar = showsRatedStar(difficulty, rated)
  const star = ratedStarPlacement(size)

  return (
    <span
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {glow && (
        <img
          src={glow}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full object-contain"
          style={{
            transform: `translateY(${glowOffset(size)}px) scale(${glowScale(epicValue, featured)})`,
          }}
        />
      )}
      <img
        src={difficultyFaceSrc(difficulty)}
        alt={difficulty ?? 'Difficulty'}
        // Rendered at intrinsic px (max-w-none defeats preflight's 100% clamp),
        // centered, then scaled — so different native crop sizes stay
        // proportional and the face ball is consistent across difficulties.
        className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
        style={{ transform: `translate(-50%, -50%) scale(${faceScale(size)})` }}
      />
      {showStar && (
        <img
          src={ratedStarSrc}
          alt="Rated"
          className="pointer-events-none absolute drop-shadow"
          style={star}
        />
      )}
    </span>
  )
}
