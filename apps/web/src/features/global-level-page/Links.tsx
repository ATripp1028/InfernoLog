import { Link, useLocation } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'
import { backOriginState } from '@/lib/backOrigin'
import { isExtremeDemon } from './format'
import {
  aredlLevelUrl,
  copiedFromLevelId,
  gdBrowserLevelUrl,
  gdBrowserUserUrl,
  gddlLevelUrl,
  youtubeSearchUrl,
} from './linkTargets'

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
  const location = useLocation()
  return (
    <Link
      to="/levels/$levelId"
      params={{ levelId: to }}
      state={backOriginState(location.href)}
      className={cn(
        'flex items-center justify-between py-2.5 text-sm text-primary-light transition hover:brightness-110',
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

/**
 * The LINKS section — external destinations plus the one internal one. Named
 * LINKS, not "External links": Newgrounds / Song File Hub belong to the Song
 * card only and are deliberately NOT duplicated here.
 */
export function Links({ level, delisted, variant = 'plain' }: LinksProps) {
  const pad = variant === 'card' ? 'px-4' : ''
  const creatorLabel = level.creator
    ? `${level.creator}'s profile on GDBrowser`
    : 'Creator profile on GDBrowser'
  const copiedFrom = copiedFromLevelId(level)

  const rows = (
    <div className="flex flex-col">
      <ExternalRow
        href={gdBrowserLevelUrl(level.inGameId)}
        label="Level on GDBrowser"
        pad={pad}
        dead={delisted}
      />
      {level.creatorAccountId && (
        <ExternalRow
          href={gdBrowserUserUrl(level.creatorAccountId)}
          label={creatorLabel}
          pad={pad}
        />
      )}
      <ExternalRow
        href={gddlLevelUrl(level.inGameId)}
        label="Tier page on GDDL"
        pad={pad}
      />
      {isExtremeDemon(level) && (
        <ExternalRow
          href={aredlLevelUrl(level.inGameId)}
          label="Page on AREDL"
          pad={pad}
        />
      )}
      <ExternalRow
        href={youtubeSearchUrl(level)}
        label="Search on YouTube"
        pad={pad}
      />

      {copiedFrom && (
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
            to={copiedFrom}
            label={`Copied from ${copiedFrom}`}
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
