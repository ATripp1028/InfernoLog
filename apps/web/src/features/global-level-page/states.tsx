import { SearchX, ServerCrash, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// The amber "this level is delisted" banner. Delisting is a fact about GD's
// servers, not the user's history, so the copy says so and logging stays fully
// enabled (the FAB is untouched). The frozen-as-of date comes from lastCheckedAt.
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
      className="flex items-start gap-2.5 rounded-card border border-[var(--color-warning)]/40 bg-[var(--color-warning-dim)] px-3.5 py-3"
    >
      <AlertTriangle
        size={16}
        className="mt-0.5 shrink-0 text-[var(--color-warning)]"
        aria-hidden
      />
      <div className="text-[13px] leading-relaxed text-text-secondary">
        <span className="font-medium text-[var(--color-warning)]">
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
      {note && <p className="mt-1 max-w-md text-xs text-text-tertiary">{note}</p>}
    </div>
  )
}

// "No such level" — terminal. Nothing was cached, so revisiting re-resolves.
// Deliberately does NOT offer name search: search is cache-backed (a subset of
// GD), so it cannot surface a level GD itself says doesn't exist.
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

// "Resolve failed" — retryable, and deliberately distinct from not-found:
// "this doesn't exist" and "we couldn't check" are different facts. Copy states
// plainly that it isn't the user's fault.
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
