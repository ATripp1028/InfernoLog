import { DifficultyFace } from '@/components/DifficultyFace'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import type { LevelMeta, ListReference } from './types'

function GddlPill({ tierOrRank }: { tierOrRank: string }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded bg-[#2d1b1b] px-2 text-[11px] font-medium text-[#ff8a8a]">
      GDDL {tierOrRank}
    </span>
  )
}

function AredlPill({ tierOrRank }: { tierOrRank: string }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded bg-[#1b1b2d] px-2 text-[11px] font-medium text-[#8a8aff]">
      AREDL #{tierOrRank}
    </span>
  )
}

interface IdentityStripProps {
  level: LevelMeta
  listRefs: ListReference[]
  /** Mobile: full-width strip with strong scrim; desktop: card inset with lighter treatment */
  variant?: 'mobile' | 'desktop'
}

export function IdentityStrip({
  level,
  listRefs,
  variant = 'mobile',
}: IdentityStripProps) {
  const gddlRef = listRefs.find((r) => r.listSource === 'GDDL')
  const aredlRef = listRefs.find((r) => r.listSource === 'AREDL')

  const isMobile = variant === 'mobile'

  return (
    <div className="relative overflow-hidden">
      {/* Thumbnail background — constructed URL, may 404 (img hides on error) */}
      <div className="absolute inset-0 bg-[var(--color-bg-base)]" />
      <img
        src={levelThumbnailUrl(level.inGameId)}
        alt=""
        aria-hidden
        className="absolute inset-0 size-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
      {/* Fixed dark scrim — not luminance-adaptive per DESIGN_LANGUAGE.md */}
      <div
        className="absolute inset-0"
        style={{
          background: isMobile ? 'rgba(13,13,13,0.78)' : 'rgba(13,13,13,0.68)',
        }}
      />

      {/* Content */}
      <div
        className={[
          'relative z-10 flex items-start',
          isMobile ? 'gap-3 px-4 py-4' : 'gap-4 px-5 py-5',
        ].join(' ')}
      >
        <DifficultyFace
          difficulty={level.inGameDifficulty}
          featured={level.featured}
          epicValue={level.epicValue}
          rated={level.isRated}
          size={isMobile ? 56 : 64}
          className="shrink-0"
        />

        <div className="min-w-0 flex-1">
          <h1
            className={[
              'font-semibold leading-tight text-text-primary',
              isMobile ? 'text-[22px]' : 'text-[26px]',
            ].join(' ')}
          >
            {level.name ?? `Level #${level.inGameId}`}
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary md:text-sm">
            by {level.creator ?? 'Unknown'} · {level.inGameId}
          </p>
          {(gddlRef || aredlRef) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {gddlRef && <GddlPill tierOrRank={gddlRef.tierOrRank} />}
              {aredlRef && <AredlPill tierOrRank={aredlRef.tierOrRank} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
