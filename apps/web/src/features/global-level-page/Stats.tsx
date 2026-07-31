import { formatNumber } from '@/features/logging/format'
import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'
import { formatGameVersion } from './format'

function StatCard({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex h-[52px] flex-col justify-center rounded-card border border-border bg-bg-surface px-3 md:h-16 md:px-3.5">
      <div className="text-[10px] uppercase tracking-wide text-text-tertiary md:text-[11px]">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-text-primary md:text-base">
        {value}
      </div>
    </div>
  )
}

function FlagChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
      {label}
    </span>
  )
}

// "{n} · verified" / "{n} · unverified" — coinsVerified says whether the coins
// are silver (verified) rather than bronze.
function formatCoins(level: GlobalLevelPageData): string {
  const count = level.coins ?? 0
  if (count <= 0) return '—'
  return `${count} · ${level.coinsVerified ? 'verified' : 'unverified'}`
}

// Six stat cards plus the conditional two-player / low-detail flag chips.
// Flags live inside this block on purpose: on mobile, collapsing Stats must
// take the chips with it (orphaned chips under a collapsed header look broken).
export function Stats({ level }: { level: GlobalLevelPageData }) {
  const hasFlags = level.twoPlayer === true || level.lowDetailMode === true

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <StatCard label="Downloads" value={formatNumber(level.downloads ?? 0)} />
        <StatCard label="Likes" value={formatNumber(level.likes ?? 0)} />
        <StatCard label="Length" value={level.length ?? '—'} />
        <StatCard
          label="Objects"
          value={
            level.objectCount != null ? formatNumber(level.objectCount) : '—'
          }
        />
        <StatCard label="Coins" value={formatCoins(level)} />
        <StatCard
          label="GD Version"
          value={formatGameVersion(level.gameVersion, level.levelVersion)}
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
