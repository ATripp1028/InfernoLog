import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'

const SOURCE_LABEL: Record<string, string> = {
  robtop_autofill: 'GD servers',
  manual: 'Manual entry',
  official: 'Official',
}

function formatChecked(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Provenance renders as a muted footer line beneath the content — NOT a card.
 * It only matters when something is off (a manual/unverified row, a stale
 * last-checked date), so it stays quiet until looked at.
 */
export function Provenance({ level }: { level: GlobalLevelPageData }) {
  const parts: string[] = []
  parts.push(`Source: ${SOURCE_LABEL[level.dataSource] ?? level.dataSource}`)
  parts.push(level.verified ? 'Verified' : 'Unverified')
  if (level.lastCheckedAt) {
    const checked = formatChecked(level.lastCheckedAt)
    if (checked) parts.push(`Checked ${checked}`)
  }

  return (
    <p className="text-[11px] leading-relaxed text-text-tertiary">
      {parts.join(' · ')}
    </p>
  )
}
