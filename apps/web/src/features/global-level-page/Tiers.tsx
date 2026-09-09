import { Info } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/generic/popover'
import { cn } from '@/lib/utils'
import type { TierEntry } from './tierEntries'

// Desktop renders the tiers inside a bordered card ('card'); mobile renders
// them bare inside the collapsible section ('plain'). Matches Song/Links.
type TiersVariant = 'card' | 'plain'

// Explains the one tier whose number lies. Every other sheet tier is ordered by
// difficulty, so a reader will take 0 for "easier than Beginner" unless told
// otherwise — mirrors the ObjectsInfoButton pattern in Stats.tsx.
function FuckTierInfoButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What does tier 0 mean?"
          className="inline-flex size-4 items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-text-secondary"
        >
          <Info size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[280px] space-y-2 p-4 text-sm">
        <p className="font-medium text-text-primary">Tier 0 isn&rsquo;t easy</p>
        <p className="text-text-secondary">
          The bottom tier is for levels demanding a skillset so niche they
          can&rsquo;t be reliably ranked against anything else — not for levels
          easier than Beginner.
        </p>
      </PopoverContent>
    </Popover>
  )
}

// The coloured placement badge. An unpainted badge (a tier whose sheet color
// hasn't been transcribed yet) falls back to the page's subtle surface rather
// than to an invented color.
function TierBadge({ entry }: { entry: TierEntry }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-8 items-center justify-center rounded px-2 py-1 text-xs font-bold',
        entry.color ? undefined : 'bg-bg-subtle'
      )}
      style={
        entry.color
          ? { backgroundColor: entry.color, color: entry.textColor }
          : undefined
      }
    >
      {entry.badge}
    </span>
  )
}

// Which of the two spreadsheets a sheet tier came from. Purely derived from the
// tier number (see lib/sheetTier.ts), and the only cue that they are two lists.
function SourceChip({ source }: { source: 'NLW' | 'LW' }) {
  return (
    <span
      className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary"
      title={
        source === 'LW'
          ? 'Listworthy spreadsheet'
          : 'Non-listworthy spreadsheet'
      }
    >
      {source}
    </span>
  )
}

function TierRow({ entry, pad }: { entry: TierEntry; pad: string }) {
  const showFuckInfo = entry.key === 'sheet' && entry.badge === '0'

  const content = (
    <>
      <span className="flex items-center gap-1 text-sm text-text-secondary">
        {entry.label}
        {showFuckInfo && <FuckTierInfoButton />}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {entry.detail && (
          <span className="truncate text-[13px] text-text-secondary">
            {entry.detail}
          </span>
        )}
        {entry.source && <SourceChip source={entry.source} />}
        <TierBadge entry={entry} />
        {entry.href && (
          <span aria-hidden className="text-text-tertiary">
            ↗
          </span>
        )}
      </span>
    </>
  )

  const rowClass = cn('flex items-center justify-between gap-3 py-2.5', pad)

  // A list with no per-level page (the spreadsheets) renders as a plain row —
  // an anchor with nowhere to go still looks clickable and would do nothing.
  if (!entry.href) return <div className={rowClass}>{content}</div>

  return (
    <a
      href={entry.href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(rowClass, 'transition-colors hover:text-text-primary')}
    >
      {content}
    </a>
  )
}

/**
 * The TIERS section — where the level actually sits on the community difficulty
 * lists, with the outbound link to each list's own page for it.
 *
 * Takes the derived rows rather than the level: the page needs to know whether
 * there are any before it renders a section header around them (an empty TIERS
 * section reads as a load failure rather than as "not ranked anywhere"), so the
 * derivation happens once, in the page's logic file.
 */
export function Tiers({
  entries,
  variant = 'plain',
}: {
  entries: TierEntry[]
  variant?: TiersVariant
}) {
  if (entries.length === 0) return null

  const pad = variant === 'card' ? 'px-4' : ''
  const rows = (
    <div className="flex flex-col">
      {entries.map((entry) => (
        <TierRow key={entry.key} entry={entry} pad={pad} />
      ))}
    </div>
  )

  if (variant === 'card') {
    return (
      <div className="rounded-card border border-border-subtle bg-bg-surface py-1.5">
        {rows}
      </div>
    )
  }
  return rows
}
