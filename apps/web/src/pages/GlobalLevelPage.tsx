import { useState } from 'react'
import {
  Link,
  useNavigate,
  useParams,
  useRouter,
} from '@tanstack/react-router'
import { ArrowLeft, Check, Flag, List, X } from 'lucide-react'
import {
  useGlobalLevelPage,
  levelPageErrorKind,
  type GlobalLevelPageData,
} from '@/lib/api/globalLevelPage'
import { useFabActions } from '@/context/FabActionsContext'
import { useLoggingFlow } from '@/features/logging/LoggingFlowProvider'
import { AddToCollectionDialog } from '@/features/collections/AddToCollectionDialog'
import { Thumbnail } from '@/features/global-level-page/Thumbnail'
import { Identity } from '@/features/global-level-page/Identity'
import { Stats } from '@/features/global-level-page/Stats'
import { Song } from '@/features/global-level-page/Song'
import { Links } from '@/features/global-level-page/Links'
import { Provenance } from '@/features/global-level-page/Provenance'
import { CollapsibleSection } from '@/features/global-level-page/CollapsibleSection'
import {
  DelistedBanner,
  NotFoundState,
  ResolveFailedState,
} from '@/features/global-level-page/states'

// Desktop section header — small uppercase grey, the desktop convention
// (mobile uses CollapsibleSection's 13px white label instead).
function DesktopSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
      {children}
    </h2>
  )
}

export function GlobalLevelPage() {
  const { levelId } = useParams({ from: '/_authenticated/levels/$levelId' })
  const navigate = useNavigate()
  const router = useRouter()
  const { openForEdit } = useLoggingFlow()
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false)

  const query = useGlobalLevelPage(levelId)
  const level = query.data
  const errorKind = query.error ? levelPageErrorKind(query.error) : null

  const goBack = () => {
    // Return to wherever the id was entered (search, list, another level).
    // Falls back to the List if there's no history to pop.
    if (window.history.length > 1) router.history.back()
    else void navigate({ to: '/list' })
  }

  // FAB — four logging actions scoped to THIS level, no destructive item
  // (there's nothing to delete on a level the user hasn't logged). Disabled
  // while a resolve is in flight; suppressed entirely on the terminal/retry
  // error states. Logging stays enabled for delisted levels — delisting is a
  // fact about GD's servers, not the user's history.
  const fabDisabled = query.isPending
  useFabActions(
    errorKind
      ? null
      : [
          {
            key: 'log-completion',
            label: 'Log a completion',
            icon: Check,
            disabled: fabDisabled,
            onClick: () => openForEdit(levelId, 'completion'),
          },
          {
            key: 'log-progress',
            label: 'Log progress',
            icon: Flag,
            disabled: fabDisabled,
            onClick: () => openForEdit(levelId, 'progress'),
          },
          {
            key: 'log-drop',
            label: 'Drop this level',
            icon: X,
            disabled: fabDisabled,
            onClick: () => openForEdit(levelId, 'drop'),
          },
          {
            key: 'add-collection',
            label: 'Add to a Collection',
            icon: List,
            disabled: fabDisabled,
            onClick: () => setAddToCollectionOpen(true),
          },
        ],
    // Mobile FAB sheet context header — the level name, once resolved.
    level ? (level.name ?? `Level #${levelId}`) : undefined
  )

  // ── Resolve in flight ──
  if (query.isPending) {
    return <PageSkeleton />
  }

  // ── Terminal / retryable error states (kept visually + textually distinct) ──
  if (errorKind === 'not_found') {
    return (
      <NotFoundState
        levelId={levelId}
        onCheckId={goBack}
        onBack={() => void navigate({ to: '/list' })}
      />
    )
  }
  if (errorKind) {
    return (
      <ResolveFailedState
        onRetry={() => void query.refetch()}
        onSearch={() => void navigate({ to: '/list' })}
      />
    )
  }

  if (!level) return null

  const levelName = level.name ?? `Level #${levelId}`
  const delisted = level.delistedAt != null

  return (
    <>
      {/* ── Mobile ─────────────────────────────────────────────── */}
      <div className="md:hidden">
        {/* BackRow — real back affordance plus the level name. */}
        <div className="flex h-14 items-center gap-2 border-b border-border-subtle px-4">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="truncate text-sm font-medium text-text-primary">
            {levelName}
          </span>
        </div>

        {delisted && (
          <div className="px-4 py-3">
            <DelistedBanner lastCheckedAt={level.lastCheckedAt} />
          </div>
        )}

        {/* Thumbnail + Identity never collapse — collapsing them would leave a
            page with no indication of which level it is. */}
        <Thumbnail
          levelId={levelId}
          levelName={levelName}
          forcePlaceholder={delisted}
        />
        {/* Identity + stats share one section — the identity block alone
            carries too little to stand on its own. Never collapses. */}
        <div className="border-b border-border-subtle px-4 py-4">
          <Identity level={level} variant="mobile" />
          <div className="mt-4 border-t border-border-subtle pt-4">
            <Stats level={level} />
          </div>
        </div>

        {/* Cross-link — its own 48px row (no arrow: the accent carries the
            affordance; ← stays the only back-arrow on the page). Right-aligned
            to match where the reciprocal link sits on the user-scoped page. */}
        {level.hasUserProgress && (
          <Link
            to="/list/$levelId"
            params={{ levelId }}
            className="flex h-12 items-center justify-end border-b border-border-subtle px-4 text-[13px] font-medium text-[var(--color-primary-light)]"
          >
            Your page for this level
          </Link>
        )}

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

      {/* ── Desktop ────────────────────────────────────────────── */}
      <div className="hidden md:block">
        <div className="mx-8 pb-16 pt-4">
          {delisted && (
            <div className="mb-4">
              <DelistedBanner lastCheckedAt={level.lastCheckedAt} />
            </div>
          )}

          {/* Breadcrumb slot — holds only the cross-link (when the user has a
              page for this level), right-aligned to match where the reciprocal
              link sits on the user-scoped page. Empty otherwise; reserved
              height keeps the layout from shifting. */}
          <div className="flex min-h-[20px] items-center justify-end pb-4">
            {level.hasUserProgress && (
              <Link
                to="/list/$levelId"
                params={{ levelId }}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-primary-light)] transition hover:brightness-110"
              >
                Your page for this level
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>

          <div className="flex gap-8 border-t border-border-subtle pt-6">
            {/* Left column — grows to fill; right column is fixed-width. */}
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

            {/* Right column — 424, fixed. */}
            <div className="w-[424px] shrink-0">
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
      </div>

      <AddToCollectionDialog
        open={addToCollectionOpen}
        onClose={() => setAddToCollectionOpen(false)}
        preselectedLevel={collectionLevel(level)}
      />
    </>
  )
}

// The subset AddToCollectionDialog needs as its preselected level.
function collectionLevel(level: GlobalLevelPageData) {
  return {
    inGameId: level.inGameId,
    name: level.name,
    creator: level.creator,
    inGameDifficulty: level.inGameDifficulty,
    featured: level.featured,
    epicValue: level.epicValue,
    isRated: level.isRated,
  }
}

// ── Loading skeleton ──────────────────────────────────────────────────────
// Mirrors the resolved page's geometry (same columns, same thumbnail box, same
// stat grid, real section headers) so nothing shifts when data lands. No
// cross-link — a LevelProgress row can't exist for an uncached level.
function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-bg-surface ${className ?? ''}`} />
}

function PageSkeleton() {
  return (
    <>
      {/* Mobile */}
      <div className="md:hidden">
        <div className="flex h-14 items-center gap-2 border-b border-border-subtle px-4">
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
          <div className="min-h-[20px] pb-4" />
          <div className="flex gap-8 border-t border-border-subtle pt-6">
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
