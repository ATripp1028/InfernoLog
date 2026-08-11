// Non-content renders for the user-scoped level page: the private/not-found
// states and the loading skeleton. Mirrors the global level page's states.tsx
// so both level pages keep their error + skeleton markup out of the page file.

import { AlertCircle, Lock } from 'lucide-react'
import { BackLink } from '@/components/shell/BackLink'
import type { GoBack } from '@/lib/useGoBack'

/**
 * Shown when the level belongs to a profile the viewer cannot see.
 */
export function PrivateProfile() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <Lock size={36} className="text-text-tertiary" />
      <div>
        <p className="text-base font-medium text-text-primary">
          This profile is private
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          Only the account owner can view this page.
        </p>
      </div>
    </div>
  )
}

/**
 * Shown when the user has no entry for this level.
 */
export function NotFound({ levelId, back }: { levelId: string; back: GoBack }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <AlertCircle size={36} className="text-text-tertiary" />
      <div>
        <p className="text-base font-medium text-text-primary">
          Level not found
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          Level #{levelId} hasn't been logged yet.
        </p>
      </div>
      <BackLink
        back={back}
        className="mt-2 text-sm text-primary-light hover:underline"
      >
        ← Back
      </BackLink>
    </div>
  )
}

/**
 * Shown when the page query failed for any other reason. Offers a retry.
 */
export function LoadFailed() {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <p className="text-sm text-text-secondary">
        Something went wrong loading this level.
      </p>
    </div>
  )
}

// ─── Loading skeletons ─────────────────────────────────────────────

function HeroSkeleton({ desktop }: { desktop?: boolean }) {
  return (
    <div
      className={[
        'animate-pulse rounded-card bg-bg-surface',
        desktop ? 'h-[383px]' : 'h-[219px]',
      ].join(' ')}
    />
  )
}

function IdentitySkeleton() {
  return (
    <div className="animate-pulse space-y-2 px-4 py-4 md:px-5 md:py-5">
      <div className="flex items-center gap-3">
        <div className="size-14 rounded-card bg-bg-subtle" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-48 rounded bg-bg-subtle" />
          <div className="h-4 w-32 rounded bg-bg-subtle" />
        </div>
      </div>
    </div>
  )
}

function StatGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 px-4 py-3 md:grid-cols-3 md:px-0 md:py-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-[52px] animate-pulse rounded-card bg-bg-surface md:h-[64px]"
        />
      ))}
    </div>
  )
}

function TimelineSkeleton() {
  return (
    <div className="space-y-2 py-2 pl-8">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className={[
            'animate-pulse rounded-card bg-bg-surface',
            i === 0 ? 'h-[140px]' : 'h-[46px]',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

/**
 * Loading skeleton for the level page.
 */
export function LevelPageSkeleton() {
  return (
    <>
      {/* Back row skeleton */}
      <div className="border-b border-border-subtle px-4 py-3 md:mx-8 md:px-0 md:py-4">
        <div className="h-5 w-40 animate-pulse rounded bg-bg-subtle" />
      </div>

      {/* Mobile skeleton */}
      <div className="md:hidden">
        <HeroSkeleton />
        <IdentitySkeleton />
        <StatGridSkeleton />
        <div className="mt-4 border-t border-border-subtle px-4 py-4">
          <div className="h-28 animate-pulse rounded-card bg-bg-surface" />
        </div>
        <div className="border-t border-border-subtle px-4 py-4">
          <TimelineSkeleton />
        </div>
      </div>

      {/* Desktop skeleton */}
      <div className="hidden md:block">
        <div className="mx-8 pb-16 pt-4">
          <div className="flex gap-6">
            <div className="min-w-0 flex-1 space-y-4">
              <HeroSkeleton desktop />
              <div className="animate-pulse rounded-card bg-bg-surface p-4">
                <IdentitySkeleton />
                <StatGridSkeleton />
              </div>
              <div className="h-32 animate-pulse rounded-card bg-bg-surface" />
            </div>
            <div className="w-[428px] shrink-0 space-y-4">
              <div className="animate-pulse rounded-card bg-bg-surface">
                <div className="h-12 border-b border-border-subtle" />
                <TimelineSkeleton />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
