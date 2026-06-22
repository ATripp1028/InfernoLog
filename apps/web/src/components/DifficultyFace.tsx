import { cn } from '@/lib/utils'
import {
  difficultyFaceSrc,
  levelGlow,
  levelGlowSrc,
  ratedStarSrc,
  showsRatedStar,
} from '@/lib/gdAssets'

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

// demon-extreme.png is the widest face crop (~160px native, since its horns
// spread the bounding box); plain difficulty faces are 120px. The on-screen
// face was tuned to look right on demon-extreme, so we treat its width as the
// reference and scale every face by the same native→display ratio. That keeps
// the actual face "ball" a consistent on-screen size across difficulties — and
// therefore keeps the glow sitting the same way behind all of them.
const FACE_REFERENCE_WIDTH = 160

// The canonical way to render a GD difficulty face with its showcase glow
// (feature circle / epic / legendary / mythic fire) behind it. Reused anywhere
// a level's difficulty is shown — search results, the logging header, lists,
// rankings, etc.
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
  // demon-extreme fills ~60% of the box when glowed (leaving room for the fire),
  // and most of it when not. Every other face scales from the same reference so
  // its ball matches. The face renders at its intrinsic size × this scale.
  const faceScale = (size * 0.6) / FACE_REFERENCE_WIDTH
  // The face seats a few pixels above the glow's center (the fire extends
  // further below than above). We nudge the GLOW down rather than the face up,
  // so the face stays at the box's vertical center and lines up with adjacent
  // text (level name, id) when rendered inline.
  const glowOffset = glow ? Math.round(size * 0.08) : 0
  // The feature-circle asset is drawn larger than the epic/legendary/mythic
  // fires, so it overruns the face's horns at full size — scale it down so it
  // stays behind the horns.
  const glowScale = levelGlow(epicValue, featured) === 'featured' ? 0.8 : 1

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
            transform: `translateY(${glowOffset}px) scale(${glowScale})`,
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
        style={{ transform: `translate(-50%, -50%) scale(${faceScale})` }}
      />
      {showStar && (
        <img
          src={ratedStarSrc}
          alt="Rated"
          className="pointer-events-none absolute drop-shadow"
          style={{
            width: Math.round(size * 0.2),
            bottom: Math.round(size * 0.25),
            right: Math.round(size * 0.25),
          }}
        />
      )}
    </span>
  )
}
