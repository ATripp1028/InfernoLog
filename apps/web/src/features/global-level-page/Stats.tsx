import { Info } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { formatNumber } from '@/features/logging/format'
import {
  gdStatIconSrc,
  officialCoinSrc,
  userCoinSilverSrc,
} from '@/lib/gdAssets'
import { cn } from '@/lib/utils'
import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'

function StatCard({
  label,
  value,
  info,
}: {
  label: string
  value: React.ReactNode
  /** Optional info popover rendered beside the label (e.g. why a value is blank). */
  info?: React.ReactNode
}) {
  return (
    <div className="flex h-[52px] flex-col justify-center rounded-card border border-border bg-bg-surface px-3 md:h-16 md:px-3.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-tertiary md:text-[11px]">
        {label}
        {info}
      </div>
      <div className="mt-1 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-sm font-medium text-text-primary md:text-base">
        {value}
      </div>
    </div>
  )
}

// A small GDBrowser-style stat glyph (download/like/length/spike/etc), sized to
// sit inline with the stat value text. `ariaLabel` doubles as the hover tooltip
// (via `title` — `aria-label` alone shows no tooltip) and the accessible name;
// without one the icon is decorative and hidden from assistive tech.
function GdIcon({
  src,
  className,
  ariaLabel,
}: {
  src: string
  className?: string
  ariaLabel?: string
}) {
  return (
    <img
      src={src}
      alt={ariaLabel ?? ''}
      title={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={cn('inline-block size-4 shrink-0 object-contain', className)}
    />
  )
}

// Explains why the object count reads "—". Mirrors the logging flow's
// GdVersionInfoButton pattern: a small Info trigger opening a short popover.
function ObjectsInfoButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Why is the object count blank?"
          className="inline-flex size-4 items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-text-secondary"
        >
          <Info size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[280px] space-y-2 p-4 text-sm">
        <p className="font-medium text-text-primary">No object count</p>
        <p className="text-text-secondary">
          Geometry Dash only reports an object count for newer levels. Older
          levels come back with none, so there&rsquo;s nothing to show here —
          it&rsquo;s not zero, just unknown.
        </p>
      </PopoverContent>
    </Popover>
  )
}

function FlagChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
      {label}
    </span>
  )
}

// Coins as sprites rather than a number: official (RobTop) levels show the gold
// secret-coin, custom levels the user coin — silver when verified, bronze-tinted
// when not. Count is implied by how many render.
function CoinValue({ level }: { level: GlobalLevelPageData }) {
  const count = level.coins ?? 0
  if (count <= 0) return <>—</>

  const isOfficial = level.creator?.toLowerCase() === 'robtop'
  const src = isOfficial ? officialCoinSrc : userCoinSilverSrc
  // Unverified custom coins are bronze in-game; tint the silver sprite rather
  // than swap to the greyed "uncollected" one.
  const bronze = !isOfficial && !level.coinsVerified
  const coinLabel = isOfficial
    ? 'Secret coin'
    : bronze
      ? 'Unverified (bronze) user coin'
      : 'Verified (silver) user coin'

  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <img
          key={i}
          src={src}
          alt=""
          title={coinLabel}
          aria-hidden
          className="size-[18px] shrink-0 object-contain"
          style={
            bronze
              ? { filter: 'sepia(1) saturate(1.9) hue-rotate(-22deg) brightness(0.9)' }
              : undefined
          }
        />
      ))}
    </span>
  )
}

// Six stat cards plus the conditional two-player / low-detail flag chips.
// Flags live inside this block on purpose: on mobile, collapsing Stats must
// take the chips with it (orphaned chips under a collapsed header look broken).
export function Stats({ level }: { level: GlobalLevelPageData }) {
  const hasFlags = level.twoPlayer === true || level.lowDetailMode === true
  const likes = level.likes ?? 0
  const hasObjects = !!level.objectCount

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {/* Download icon trails the count. */}
        <StatCard
          label="Downloads"
          value={
            <>
              {formatNumber(level.downloads ?? 0)}
              <GdIcon src={gdStatIconSrc.download} ariaLabel="Downloads" />
            </>
          }
        />
        {/* Like icon for a non-negative score, dislike icon when the net score
            is negative (GD stores dislikes as a negative like count). */}
        <StatCard
          label="Likes"
          value={
            <>
              <GdIcon
                src={likes < 0 ? gdStatIconSrc.dislike : gdStatIconSrc.like}
                ariaLabel={likes < 0 ? 'Dislikes' : 'Likes'}
              />
              {formatNumber(Math.abs(likes))}
            </>
          }
        />
        <StatCard
          label="Length"
          value={
            <>
              <GdIcon src={gdStatIconSrc.length} ariaLabel="Length" />
              {level.length ?? '—'}
            </>
          }
        />
        <StatCard
          label="Objects"
          // getGJLevels21 (the browse endpoint) only reports object count for
          // newer levels; older ones come back as 0. A real level never has 0
          // objects, so treat 0 (and null) as "unknown" — show "—" and an info
          // popover explaining why, rather than an obviously-wrong count.
          value={
            <>
              <GdIcon src={gdStatIconSrc.spike} ariaLabel="Objects" />
              {hasObjects ? formatNumber(level.objectCount!) : '—'}
            </>
          }
          info={hasObjects ? undefined : <ObjectsInfoButton />}
        />
        <StatCard label="Coins" value={<CoinValue level={level} />} />
        {/* Info glyph for the game version, edit (build-tools) glyph for the
            level's own revision number. */}
        <StatCard
          label="Version"
          value={
            <span className="flex items-center gap-2.5">
              <span className="flex items-center gap-1">
                <GdIcon src={gdStatIconSrc.info} ariaLabel="Game Version" />
                {level.gameVersion ?? '—'}
              </span>
              {level.levelVersion != null && (
                <span className="flex items-center gap-1">
                  <GdIcon src={gdStatIconSrc.edit} ariaLabel="Level Version" />
                  {level.levelVersion}
                </span>
              )}
            </span>
          }
        />
      </div>

      {/* Only rendered when at least one flag is true — a level with neither
          shows no row at all (never "TWO PLAYER: No"). */}
      {hasFlags && (
        <div className="mt-3 flex flex-wrap gap-2">
          {level.twoPlayer === true && <FlagChip label="2-Player" />}
          {level.lowDetailMode === true && <FlagChip label="Low Detail Mode" />}
        </div>
      )}
    </div>
  )
}
