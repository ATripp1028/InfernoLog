import {
  ArrowLeft,
  SearchX,
  ServerCrash,
  AlertTriangle,
  Hourglass,
} from 'lucide-react'
import { formatRetryWait } from '@/lib/api/client'
import { Button } from '@/components/generic/button'
import { DesktopSectionHeader } from '@/features/global-level-page/CollapsibleSection'

/**
 * The amber "this level is delisted" banner. Delisting is a fact about GD's
 * servers, not the user's history, so the copy says so and logging stays fully
 * enabled (the FAB is untouched). The frozen-as-of date comes from lastCheckedAt.
 */
export function DelistedBanner({
  lastCheckedAt,
}: {
  lastCheckedAt: string | null
}) {
  const asOf = lastCheckedAt
    ? new Date(lastCheckedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-card border border-warning/40 bg-warning-dim px-3.5 py-3"
    >
      <AlertTriangle
        size={16}
        className="mt-0.5 shrink-0 text-warning"
        aria-hidden
      />
      <div className="text-[13px] leading-relaxed text-text-secondary">
        <span className="font-medium text-warning">
          No longer on GD&rsquo;s servers.
        </span>{' '}
        Data frozen{asOf ? ` as of ${asOf}` : ''}. Logging still works — your
        history is unaffected.
      </div>
    </div>
  )
}

// A shared centered terminal/error frame.
function CenteredState({
  icon,
  title,
  body,
  note,
  children,
}: {
  icon: React.ReactNode
  title: string
  body: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      {icon}
      <div className="max-w-md">
        <p className="text-lg font-semibold text-text-primary">{title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
          {body}
        </p>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {children}
      </div>
      {note && (
        <p className="mt-1 max-w-md text-xs text-text-tertiary">{note}</p>
      )}
    </div>
  )
}

/**
 * "No such level" — terminal. Nothing was cached, so revisiting re-resolves.
 * Deliberately does NOT offer name search: search is cache-backed (a subset of
 * GD), so it cannot surface a level GD itself says doesn't exist.
 */
export function NotFoundState({
  levelId,
  onCheckId,
  onBack,
}: {
  levelId: string
  onCheckId: () => void
  onBack: () => void
}) {
  return (
    <CenteredState
      icon={<SearchX size={38} className="text-text-tertiary" />}
      title="Level not found"
      body={`GD's servers have no level with ID ${levelId}. It may have been deleted, or the ID may be wrong.`}
      note="Name search can't help here — it's cache-backed, and the cache is a subset of GD."
    >
      <Button variant="default" onClick={onCheckId}>
        Check the ID
      </Button>
      <Button variant="outline" onClick={onBack}>
        Back
      </Button>
    </CenteredState>
  )
}

/**
 * "Resolve failed" — retryable, and deliberately distinct from not-found:
 * "this doesn't exist" and "we couldn't check" are different facts. Reserved for
 * the 503 case ONLY, where GD genuinely couldn't be reached (a cache miss whose
 * RobTop resolve failed); the copy blames GD's servers, so it must not be shown
 * for errors GD had no part in. Copy states plainly that it isn't the user's fault.
 */
export function ResolveFailedState({
  onRetry,
  onSearch,
}: {
  onRetry: () => void
  onSearch: () => void
}) {
  return (
    <CenteredState
      icon={<ServerCrash size={38} className="text-text-tertiary" />}
      title="Couldn't reach GD's servers"
      body="This is usually temporary and not something you did. Level data will load once the servers respond."
    >
      <Button variant="default" onClick={onRetry}>
        Retry
      </Button>
      <Button variant="outline" onClick={onSearch}>
        Search the cache
      </Button>
    </CenteredState>
  )
}

/**
 * "Slow down" — the per-user GD-lookup budget is spent (429).
 *
 * Deliberately NOT worded as an error and deliberately not blaming GD: the
 * request was refused by InfernoLog, GD is fine, and the only reason a normal
 * session reaches this is a level id being looked up over and over. Only a
 * cache MISS can spend the budget, so the honest framing is "you've asked for a
 * lot of levels we don't have yet". Retry is offered but the wait is stated
 * first, so retrying immediately isn't the obvious move.
 */
export function RateLimitedState({
  retryAfterSeconds,
  onRetry,
  onSearch,
}: {
  retryAfterSeconds: number
  onRetry: () => void
  onSearch: () => void
}) {
  return (
    <CenteredState
      icon={<Hourglass size={38} className="text-text-tertiary" />}
      title="Too many GD lookups"
      body={`You've looked up a lot of levels that aren't cached yet. This clears on its own in ${formatRetryWait(retryAfterSeconds)} — levels already in the cache keep loading normally in the meantime.`}
    >
      <Button variant="default" onClick={onSearch}>
        Search the cache
      </Button>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </CenteredState>
  )
}

/**
 * Generic failure — a 500, a network blip, anything that isn't a clean
 * not-found (404) or GD-unreachable (503). Crucially this covers cached levels,
 * whose /page request never touches GD, so the copy must NOT blame GD's servers
 * (the old catch-all did, which was actively misleading). Retryable, since these
 * are usually transient (e.g. a DB cold start).
 */
export function GenericErrorState({
  onRetry,
  onSearch,
}: {
  onRetry: () => void
  onSearch: () => void
}) {
  return (
    <CenteredState
      icon={<ServerCrash size={38} className="text-text-tertiary" />}
      title="Something went wrong"
      body="We couldn't load this level. This is usually temporary — try again in a moment."
    >
      <Button variant="default" onClick={onRetry}>
        Retry
      </Button>
      <Button variant="outline" onClick={onSearch}>
        Search the cache
      </Button>
    </CenteredState>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────
// Mirrors the resolved page's geometry (same columns, same thumbnail box, same
// stat grid, real section headers) so nothing shifts when data lands. No
// cross-link — a LevelProgress row can't exist for an uncached level.
function Pulse({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-bg-surface ${className ?? ''}`} />
  )
}

/**
 * Loading skeleton for the Global Level Page, sized to the real layout so nothing shifts when data lands.
 */
export function PageSkeleton() {
  return (
    <>
      {/* Mobile */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
          <ArrowLeft size={18} className="text-text-tertiary" />
          <Pulse className="h-4 w-40" />
        </div>
        <div className="aspect-video w-full animate-pulse bg-bg-surface" />
        <div className="border-b border-border-subtle px-4 py-4">
          <div className="flex gap-4">
            <Pulse className="size-[76px] shrink-0 rounded-card" />
            <div className="flex-1 space-y-2">
              <Pulse className="h-5 w-2/3" />
              <Pulse className="h-4 w-1/3" />
              <Pulse className="h-6 w-3/4 rounded-md" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border-subtle pt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Pulse key={i} className="h-[52px] rounded-card" />
            ))}
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <div className="mx-8 pb-16 pt-4">
          <div className="mb-4 flex items-center gap-2 border-b border-border-subtle py-4">
            <ArrowLeft size={18} className="text-text-tertiary" />
            <Pulse className="h-4 w-40" />
          </div>
          <div className="flex gap-8">
            <div className="min-w-0 flex-1">
              <Pulse className="aspect-video w-full rounded-card" />
              <div className="mt-5 rounded-card border border-border-subtle bg-bg-surface p-5">
                <div className="flex gap-4">
                  <Pulse className="size-[104px] shrink-0 rounded-card" />
                  <div className="flex-1 space-y-2">
                    <Pulse className="h-6 w-1/2" />
                    <Pulse className="h-4 w-1/4" />
                    <Pulse className="h-6 w-2/3 rounded-md" />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border-subtle pt-5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Pulse key={i} className="h-16 rounded-card" />
                  ))}
                </div>
              </div>
            </div>
            <div className="w-[424px] shrink-0">
              <DesktopSectionHeader>Song</DesktopSectionHeader>
              <div className="flex gap-3">
                <Pulse className="size-14 shrink-0 rounded-card" />
                <div className="flex-1 space-y-2">
                  <Pulse className="h-4 w-1/2" />
                  <Pulse className="h-3 w-1/3" />
                  <Pulse className="h-6 w-24 rounded-md" />
                </div>
              </div>
              <div className="mt-7">
                <DesktopSectionHeader>Links</DesktopSectionHeader>
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Pulse key={i} className="h-4 w-2/3" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
