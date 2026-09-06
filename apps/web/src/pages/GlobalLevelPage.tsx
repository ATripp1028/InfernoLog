import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { BackLink } from '@/components/shell/BackLink'
import { MOBILE_HERO_CLASS } from '@/lib/useWideLayout'
import { AddToCollectionDialog } from '@/features/collections/AddToCollectionDialog'
import { Thumbnail } from '@/features/global-level-page/Thumbnail'
import { Identity } from '@/features/global-level-page/Identity'
import { Stats } from '@/features/global-level-page/Stats'
import { Song } from '@/features/global-level-page/Song'
import { Links } from '@/features/global-level-page/Links'
import { Provenance } from '@/features/global-level-page/Provenance'
import {
  CollapsibleSection,
  DesktopSectionHeader,
} from '@/features/global-level-page/CollapsibleSection'
import {
  DelistedBanner,
  NotFoundState,
  RateLimitedState,
  ResolveFailedState,
  GenericErrorState,
  PageSkeleton,
} from '@/features/global-level-page/states'
import { useGlobalLevelDetailPage } from '@/features/global-level-page/useGlobalLevelDetailPage'

/**
 * A level's public page — its RobTop metadata, song, and links — independent of whether the viewer has logged it.
 */
export function GlobalLevelPage() {
  const {
    levelId,
    back,
    isWide,
    isLoading,
    errorKind,
    retryAfterSeconds,
    retry,
    goToList,
    level,
    levelName,
    delisted,
    hasUserProgress,
    preselectedLevel,
    addToCollectionOpen,
    setAddToCollectionOpen,
  } = useGlobalLevelDetailPage()

  // ── Resolve in flight ──
  if (isLoading) {
    return <PageSkeleton />
  }

  // ── Terminal / retryable error states (kept visually + textually distinct) ──
  if (errorKind === 'not_found') {
    return (
      <NotFoundState
        levelId={levelId}
        onCheckId={back.onClick}
        onBack={goToList}
      />
    )
  }
  // 503 — GD genuinely unreachable (a cache miss whose RobTop resolve failed).
  if (errorKind === 'unreachable') {
    return <ResolveFailedState onRetry={retry} onSearch={goToList} />
  }
  // 429 — this user's GD-lookup budget is spent. Only a cache miss can reach
  // it, so cached levels keep loading; the copy says so.
  if (errorKind === 'rate_limited') {
    return (
      <RateLimitedState
        retryAfterSeconds={retryAfterSeconds}
        onRetry={retry}
        onSearch={goToList}
      />
    )
  }
  // Anything else (500, network failure) — don't blame GD; a cached level's
  // /page request never touches it.
  if (errorKind) {
    return <GenericErrorState onRetry={retry} onSearch={goToList} />
  }

  if (!level) return null

  return (
    <>
      {/* One layout is mounted, not both — see `useWideLayout`. */}
      {!isWide && (
        <div>
          {/* BackRow — real back affordance plus the level name. Padding and
              spacing mirror the user-scoped level page's back row. */}
          <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
            <BackLink
              back={back}
              ariaLabel="Back"
              className="text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft size={18} />
            </BackLink>
            <span className="truncate text-sm font-medium text-text-primary">
              {levelName}
            </span>
            {/* Cross-link — right-aligned to match where the reciprocal link
                sits on the user-scoped page. */}
            {hasUserProgress && (
              <Link
                to="/log/$levelId"
                params={{ levelId }}
                state={true}
                className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-primary-light transition hover:brightness-110"
              >
                Your page for this level
                <ArrowRight size={14} />
              </Link>
            )}
          </div>

          {delisted && (
            <div className="px-4 py-3">
              <DelistedBanner lastCheckedAt={level.lastCheckedAt} />
            </div>
          )}

          {/* Thumbnail + Identity never collapse — collapsing them would leave
              a page with no indication of which level it is. */}
          <Thumbnail
            levelId={levelId}
            levelName={levelName}
            forcePlaceholder={delisted}
            className={MOBILE_HERO_CLASS}
          />
          {/* Identity + stats share one section — the identity block alone
              carries too little to stand on its own. Never collapses. */}
          <div className="border-b border-border-subtle px-4 py-4">
            <Identity level={level} variant="mobile" />
            <div className="mt-4 border-t border-border-subtle pt-4">
              <Stats level={level} />
            </div>
          </div>

          <CollapsibleSection title="Song">
            <Song level={level} />
          </CollapsibleSection>
          <CollapsibleSection title="Links">
            <Links level={level} delisted={delisted} />
          </CollapsibleSection>

          <div className="border-t border-border-subtle px-4 py-4">
            <Provenance level={level} />
          </div>
        </div>
      )}

      {isWide && (
        <div className="mx-8 pb-16">
          {/* Back row — mirrors the user-scoped level page's desktop back
              row: back arrow + level name on the left, cross-link (when the
              user has a page for this level) right-aligned. */}
          <div className="mb-4 flex items-center gap-2 border-b border-border-subtle py-4">
            <BackLink
              back={back}
              ariaLabel="Back"
              className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft size={18} />
            </BackLink>
            <span className="truncate text-sm font-medium text-text-primary">
              {levelName}
            </span>
            {hasUserProgress && (
              <Link
                to="/log/$levelId"
                params={{ levelId }}
                state={true}
                className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-primary-light transition hover:brightness-110"
              >
                Your page for this level
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>

          {delisted && (
            <div className="mb-4">
              <DelistedBanner lastCheckedAt={level.lastCheckedAt} />
            </div>
          )}

          <div className="flex gap-8">
            {/* Left column — grows to fill whatever the right column leaves. */}
            <div className="min-w-0 flex-1">
              <Thumbnail
                levelId={levelId}
                levelName={levelName}
                forcePlaceholder={delisted}
                className="rounded-card"
              />
              {/* Identity + stats share one card — the identity block alone
                  carries too little to justify a card of its own. */}
              <div className="mt-5 rounded-card border border-border-subtle bg-bg-surface p-5">
                <Identity level={level} variant="desktop" />
                <div className="mt-5 border-t border-border-subtle pt-5">
                  <Stats level={level} />
                </div>
              </div>
            </div>

            {/* Right column — tracks the viewport rather than sitting at a
                fixed 424, so the column beside it stays readable at the
                narrow end of the wide range. */}
            <div className="w-[clamp(300px,34vw,424px)] shrink-0">
              <div>
                <DesktopSectionHeader>Song</DesktopSectionHeader>
                <Song level={level} variant="card" />
              </div>
              <div className="mt-7">
                <DesktopSectionHeader>Links</DesktopSectionHeader>
                <Links level={level} delisted={delisted} variant="card" />
              </div>
              <div className="mt-5 border-t border-border-subtle pt-3">
                <Provenance level={level} />
              </div>
            </div>
          </div>
        </div>
      )}

      {preselectedLevel && (
        <AddToCollectionDialog
          open={addToCollectionOpen}
          onClose={() => setAddToCollectionOpen(false)}
          preselectedLevel={preselectedLevel}
        />
      )}
    </>
  )
}
