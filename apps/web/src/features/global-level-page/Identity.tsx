import { DifficultyFace } from '@/components/DifficultyFace'
import { CopyableId } from '@/components/CopyableId'
import { ratedStarSrc } from '@/lib/gdAssets'
import { cn } from '@/lib/utils'
import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'
import { showcaseTier, showcaseLabel, type ShowcaseTier } from './format'

// Showcase hues — the glow behind the face carries this visually; the pill
// echoes it in text so it survives a glance at the label alone.
const SHOWCASE_COLOR: Record<ShowcaseTier, string> = {
  mythic: '#ff5ea0',
  legendary: '#ffc93c',
  epic: '#b06bff',
  featured: '#4aa3ff',
}

function Pill({
  children,
  className,
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-medium leading-none text-text-secondary',
        className
      )}
      style={style}
    >
      {children}
    </span>
  )
}

interface IdentityProps {
  level: GlobalLevelPageData
  variant: 'mobile' | 'desktop'
}

export function Identity({ level, variant }: IdentityProps) {
  const isMobile = variant === 'mobile'
  const tier = showcaseTier(level)
  const showStarCount = level.isRated && level.stars != null && level.stars > 0
  const description = level.description?.trim()

  return (
    <div className={cn('flex gap-4', isMobile ? 'px-4 py-4' : '')}>
      <DifficultyFace
        difficulty={level.inGameDifficulty}
        featured={level.featured}
        epicValue={level.epicValue}
        rated={level.isRated}
        size={isMobile ? 76 : 104}
        className="shrink-0"
      />

      <div className="min-w-0 flex-1">
        {/* Inter Semi Bold — Pusab is not used here (matches the sibling page). */}
        <h1
          className={cn(
            'font-semibold leading-tight text-text-primary',
            isMobile ? 'text-[22px]' : 'text-[26px]'
          )}
        >
          {level.name ?? `Level #${level.inGameId}`}
        </h1>
        <p className="mt-1 text-[13px] text-text-secondary md:text-sm">
          by {level.creator ?? 'Unknown'}
        </p>

        {/* Chip row — flex-wraps on mobile where the chips don't all fit
            beside the face. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <CopyableId id={level.inGameId} label="Level ID" />

          {/* No difficulty pill — the face already communicates difficulty. */}
          {showStarCount && (
            <Pill>
              {level.stars}
              <img src={ratedStarSrc} alt="" aria-hidden className="size-3" />
            </Pill>
          )}

          {tier && (
            <Pill
              className="uppercase tracking-wide"
              style={{ color: SHOWCASE_COLOR[tier] }}
            >
              {showcaseLabel(tier)}
            </Pill>
          )}
        </div>

        {/* Description renders as a single conditional line, not its own card —
            GD descriptions are usually empty. */}
        {description && (
          <p className="mt-3 text-[13px] leading-relaxed text-text-secondary">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
