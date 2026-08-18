import { Music } from 'lucide-react'
import { CopyableId } from '@/components/data/CopyableId'
import { cn } from '@/lib/utils'
import { safeHref } from '@/lib/safeUrl'
import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'
import { formatSongSize } from './format'
import { songSource } from './display'
import { SectionLabel } from '@/components/inputs/SectionLabel'

// Desktop renders the song inside a bordered card ('card'); mobile renders it
// bare inside the collapsible section ('plain'). Only the outer chrome and the
// section horizontal padding differ between the two.
type SongVariant = 'card' | 'plain'

// An ember-coloured external link with the ↗ leaving-InfernoLog glyph.
// `href` here is level metadata from GD's servers and the SongFileHub API,
// not something InfernoLog validated on the way in — so it goes through
// safeHref like any other externally-sourced URL. A URL that doesn't survive
// that check renders nothing at all: an anchor with no href still looks like a
// link and would silently do nothing when clicked.
function EmberLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const safe = safeHref(href)
  if (!safe) return null
  return (
    <a
      href={safe}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-[13px] font-medium text-primary-light transition hover:brightness-110"
    >
      {children}
      <span aria-hidden>↗</span>
    </a>
  )
}

// A label-left / value-right row.
function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[11px] uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      <span className="text-sm font-medium text-text-secondary">{value}</span>
    </div>
  )
}

function ArtPlaceholder() {
  return (
    <div
      className="flex size-12 shrink-0 items-center justify-center rounded-card bg-bg-elevated text-text-tertiary"
      aria-hidden
    >
      <Music size={20} />
    </div>
  )
}

// ── Standard (non-NONG) ─────────────────────────────────────────────────────

function StandardSong({
  level,
  pad,
}: {
  level: GlobalLevelPageData
  pad: string
}) {
  const size = formatSongSize(level.songSize)
  const source = songSource(level)

  return (
    <>
      <div className={cn('flex items-center gap-3', pad, 'pt-4')}>
        <ArtPlaceholder />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-text-primary">
            {level.songName ?? 'Unknown song'}
          </p>
          <p className="truncate text-[13px] text-text-secondary">
            {level.songAuthor ?? 'Unknown artist'}
          </p>
        </div>
      </div>

      <div className={cn('mt-3 border-t border-border-subtle', pad, 'py-3')}>
        {level.songId && (
          <KVRow
            label="Song ID"
            value={<CopyableId id={level.songId} label="Song ID" />}
          />
        )}
        {size && <KVRow label="File size" value={size} />}
        <KVRow label="Source" value={source} />
        {level.songLink && (
          <div className="pt-2">
            <EmberLink href={level.songLink}>Open on Newgrounds</EmberLink>
          </div>
        )}
      </div>
    </>
  )
}

// ── NONG (shows both songs) ─────────────────────────────────────────────────

function NongSong({ level, pad }: { level: GlobalLevelPageData; pad: string }) {
  const ngSize = formatSongSize(level.songSize)

  return (
    <>
      {/* Title block — sfhSongName is stored raw/unsplit, so there's no
          separate artist line; the NONG badge takes that slot. */}
      <div className={cn('flex items-center gap-3', pad, 'pt-4')}>
        <ArtPlaceholder />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-text-primary">
            {level.sfhSongName ?? 'NONG song'}
          </p>
          <span className="mt-1 inline-flex items-center rounded bg-warning-dim px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
            NONG
          </span>
        </div>
      </div>

      {/* One shared SONG ID row — the SFH entry is keyed by the Newgrounds song
          it replaces, so both ids are always the same value. */}
      {level.songId && (
        <div className={cn('mt-3 border-t border-border-subtle', pad, 'py-3')}>
          <KVRow
            label="Song ID"
            value={<CopyableId id={level.songId} label="Song ID" />}
          />
          <p className="text-[11px] text-text-tertiary">
            Level-scoped. Not a cross-level song identity.
          </p>
        </div>
      )}

      {/* NONG · VIA SONG FILE HUB — the replacement song's own details. */}
      <div className={cn('border-t border-border-subtle', pad, 'py-3')}>
        <SectionLabel size="xs" className="mb-2">
          NONG · via Song File Hub
        </SectionLabel>
        {level.sfhFileType && (
          <KVRow label="File type" value={level.sfhFileType.toUpperCase()} />
        )}
        {level.sfhDownloads != null && (
          <KVRow
            label="SFH downloads"
            value={level.sfhDownloads.toLocaleString()}
          />
        )}
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {level.sfhYoutubeUrl && (
            <EmberLink href={level.sfhYoutubeUrl}>Listen on YouTube</EmberLink>
          )}
          {level.sfhDownloadUrl && (
            <EmberLink href={level.sfhDownloadUrl}>
              Download {level.sfhFileType ? `.${level.sfhFileType}` : 'file'}
            </EmberLink>
          )}
        </div>
      </div>

      {/* IN-GAME SONG · NEWGROUNDS — the placeholder song the level ships with.
          These come from the level fetch, not SFH (a two-source card). Players
          sometimes use this Newgrounds song even when a NONG exists. */}
      <div className={cn('border-t border-border-subtle', pad, 'py-3')}>
        <SectionLabel size="xs" className="mb-2">
          In-game song · Newgrounds
        </SectionLabel>
        <p className="truncate text-sm font-semibold text-text-primary">
          {level.songName ?? 'Unknown song'}
        </p>
        <p className="truncate text-[13px] text-text-secondary">
          {level.songAuthor ?? 'Unknown artist'}
        </p>
        {ngSize && <KVRow label="File size" value={ngSize} />}
        {level.songLink && (
          <div className="pt-2">
            <EmberLink href={level.songLink}>Open on Newgrounds</EmberLink>
          </div>
        )}
      </div>
    </>
  )
}

/**
 * The level's song card: the in-game track, or the NONG with its Song File Hub details.
 */
export function Song({
  level,
  variant = 'plain',
}: {
  level: GlobalLevelPageData
  variant?: SongVariant
}) {
  // Card variant insets each section with px-4; plain relies on the parent
  // collapsible's padding, so sections add no horizontal padding of their own.
  const pad = variant === 'card' ? 'px-4' : ''
  const inner = level.isNong ? (
    <NongSong level={level} pad={pad} />
  ) : (
    <StandardSong level={level} pad={pad} />
  )

  if (variant === 'card') {
    return (
      <div className="overflow-hidden rounded-card border border-border-subtle bg-bg-surface pb-1">
        {inner}
      </div>
    )
  }
  return <div className="-mt-1">{inner}</div>
}
