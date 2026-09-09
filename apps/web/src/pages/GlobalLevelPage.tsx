import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { BackLink } from '@/components/shell/BackLink'
import { MOBILE_HERO_CLASS } from '@/lib/useWideLayout'
import { AddToCollectionDialog } from '@/features/collections/AddToCollectionDialog'
import { HeroVideo } from '@/components/data/HeroVideo'
import { Thumbnail } from '@/features/global-level-page/Thumbnail'
import { Identity } from '@/features/global-level-page/Identity'
import { Stats } from '@/features/global-level-page/Stats'
import { Song } from '@/features/global-level-page/Song'
import { Tiers } from '@/features/global-level-page/Tiers'
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
    showcaseUrl,
    tiers,
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

  // The hero slot: the level's showcase video when it has one, otherwise its
  // thumbnail. Both layouts render this, differing only in the class they pass,
  // so the choice is made once here rather than twice in JSX.
  const hero = (className: string) =>
    showcaseUrl ? (
      <HeroVideo url={showcaseUrl} label="Showcase" className={className} />
    ) : (
      <Thumbnail
        levelId={levelId}
        levelName={levelName}
        forcePlaceholder={delisted}
        className={className}
      />
    )

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

          {/* Hero + Identity never collapse — collapsing them would leave a
              page with no indication of which level it is. */}
          {hero(MOBILE_HERO_CLASS)}
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
          {/* Tiers renders nothing when the level is on no community list, so
              the section header would otherwise open onto an empty body. */}
          {tiers.length > 0 && (
            <CollapsibleSection title="Tiers">
              <Tiers entries={tiers} />
            </CollapsibleSection>
          )}
          <CollapsibleSection title="Links">
            <Links level={level} delisted={delisted} />
          </CollapsibleSection>

          <div className="border-t border-border-subtle px-4 py-4">
            <Provenance level={level} />
          </div>
        </div>
      )}

      {isWide && (
        // h-full + min-h-0 so the two panes below can own the scrolling
        // instead of the shell's <main>. Without min-h-0 a flex child refuses
        // to shrink past its content and both panes grow the page instead.
        <div className="flex h-full min-h-0 flex-col">
          {/* Back row — mirrors the user-scoped level page's desktop back
              row: back arrow + level name on the left, cross-link (when the
              user has a page for this level) right-aligned. */}
          <div className="mx-8 mb-4 flex shrink-0 items-center gap-2 border-b border-border-subtle py-4">
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
            <div className="mx-8 mb-4 shrink-0">
              <DelistedBanner lastCheckedAt={level.lastCheckedAt} />
            </div>
          )}

          {/* The two panes scroll independently: the level's identity stays put
              while the song/tiers/links column is read, and vice versa. */}
          <div className="flex min-h-0 flex-1 gap-8 overflow-hidden px-8">
            {/* Left column — grows to fill whatever the right column leaves. */}
            <div className="min-w-0 flex-1 overflow-y-auto pb-8">
              {hero('rounded-card')}
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
                narrow end of the wide range. pb-28 clears the FAB, which is
                fixed to the viewport's bottom-right and so overlaps only this
                column; without it the last row of Provenance sits under it. */}
            <div className="w-[clamp(300px,34vw,424px)] shrink-0 overflow-y-auto pb-28">
              <div>
                <DesktopSectionHeader>Song</DesktopSectionHeader>
                <Song level={level} variant="card" />
              </div>
              {tiers.length > 0 && (
                <div className="mt-7">
                  <DesktopSectionHeader>Tiers</DesktopSectionHeader>
                  <Tiers entries={tiers} variant="card" />
                </div>
              )}
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
