import { cn } from '@/lib/utils'
import { difficultyFaceSrc, levelGlowSrc } from '@/lib/gdAssets'

interface DifficultyFaceProps {
  /** In-game difficulty label, e.g. "Extreme Demon" / "Insane" / "Auto". */
  difficulty: string | null
  /** Whether the level is featured (drives the feature-circle glow). */
  featured?: boolean | null
  /** Epic rating: 0 none, 1 epic, 2 legendary, 3 mythic — outranks featured. */
  epicValue?: number | null
  /** Box size in px (the glow fills it; the face is inset). Default 36. */
  size?: number
  className?: string
}

// The canonical way to render a GD difficulty face with its showcase glow
// (feature circle / epic / legendary / mythic fire) behind it. Reused anywhere
// a level's difficulty is shown — search results, the logging header, lists,
// rankings, etc. When the level has no glow, the face renders at full size.
export function DifficultyFace({
  difficulty,
  featured,
  epicValue,
  size = 70,
  className,
}: DifficultyFaceProps) {
  const glow = levelGlowSrc(epicValue, featured)
  // Inset the face so the surrounding fire/ring stays visible; full size when
  // there's no glow behind it.
  const facePx = Math.round(size * (glow ? 0.6 : 1))
  // The face seats a few pixels above the glow's center (the fire extends
  // further below than above). We nudge the GLOW down rather than the face up,
  // so the face stays at the box's vertical center and lines up with adjacent
  // text (level name, id) when rendered inline.
  const glowOffset = glow ? Math.round(size * 0.08) : 0

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        className
      )}
      style={{ width: size, height: size }}
    >
      {glow && (
        <img
          src={glow}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full object-contain"
          style={{ transform: `translateY(${glowOffset}px)` }}
        />
      )}
      <img
        src={difficultyFaceSrc(difficulty)}
        alt={difficulty ?? 'Difficulty'}
        className="relative object-contain"
        style={{ width: facePx, height: facePx }}
      />
    </span>
  )
}
