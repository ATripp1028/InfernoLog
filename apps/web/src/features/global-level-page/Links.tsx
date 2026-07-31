import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'
import { isExtremeDemon } from './format'

// External link builders. AREDL's public level URL isn't pinned in the docs
// yet (the acknowledgments page still lists it as pending); aredl.net is the
// current home, so we point there.
const gdBrowserLevel = (id: string) => `https://gdbrowser.com/${id}`
const gdBrowserUser = (accountId: string) =>
  `https://gdbrowser.com/u/${accountId}`
const gddlLevel = (id: string) => `https://gdladder.com/level/${id}`
const aredlLevel = (id: string) => `https://aredl.net/levels/${id}`

type LinksVariant = 'card' | 'plain'

// An external destination — trailing ↗ marks it as leaving InfernoLog.
function ExternalRow({
  href,
  label,
  pad,
  dead = false,
}: {
  href: string
  label: string
  pad: string
  dead?: boolean
}) {
  const content = (
    <>
      <span>{label}</span>
      <span aria-hidden className="text-text-tertiary">
        ↗
      </span>
    </>
  )

  if (dead) {
    return (
      <div
        className={cn(
          'flex items-center justify-between py-2.5 text-sm text-text-tertiary',
          pad
        )}
        aria-disabled
      >
        {content}
      </div>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        'flex items-center justify-between py-2.5 text-sm text-text-secondary transition-colors hover:text-text-primary',
        pad
      )}
    >
      {content}
    </a>
  )
}

// An internal destination — trailing → (not ↗) is the only cue that it stays
// inside InfernoLog; no explanatory text needed.
function InternalRow({
  to,
  label,
  pad,
}: {
  to: string
  label: string
  pad: string
}) {
  return (
    <Link
      to="/levels/$levelId"
      params={{ levelId: to }}
      className={cn(
        'flex items-center justify-between py-2.5 text-sm text-[var(--color-primary-light)] transition hover:brightness-110',
        pad
      )}
    >
      <span>{label}</span>
      <span aria-hidden>→</span>
    </Link>
  )
}

interface LinksProps {
  level: GlobalLevelPageData
  delisted: boolean
  variant?: LinksVariant
}

// The LINKS section — external destinations plus the one internal one. Named
// LINKS, not "External links": Newgrounds / Song File Hub belong to the Song
// card only and are deliberately NOT duplicated here.
export function Links({ level, delisted, variant = 'plain' }: LinksProps) {
  const pad = variant === 'card' ? 'px-4' : ''
  const creatorLabel = level.creator
    ? `${level.creator}'s profile on GDBrowser`
    : 'Creator profile on GDBrowser'

  const rows = (
    <div className="flex flex-col">
      <ExternalRow
        href={gdBrowserLevel(level.inGameId)}
        label="Level on GDBrowser"
        pad={pad}
        dead={delisted}
      />
      {level.creatorAccountId && (
        <ExternalRow
          href={gdBrowserUser(level.creatorAccountId)}
          label={creatorLabel}
          pad={pad}
        />
      )}
      <ExternalRow
        href={gddlLevel(level.inGameId)}
        label="Tier page on GDDL"
        pad={pad}
      />
      {isExtremeDemon(level) && (
        <ExternalRow
          href={aredlLevel(level.inGameId)}
          label="Placement on AREDL"
          pad={pad}
        />
      )}

      {level.copiedFromId != null && (
        <>
          <p
            className={cn(
              'pb-0.5 pt-3 text-[10px] font-medium uppercase tracking-wider text-text-tertiary',
              pad
            )}
          >
            In InfernoLog
          </p>
          <InternalRow
            to={level.copiedFromId}
            label={`Copied from ${level.copiedFromId}`}
            pad={pad}
          />
        </>
      )}
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
