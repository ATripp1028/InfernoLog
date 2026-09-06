// Non-content renders for the user-scoped level page: the private/not-found
// states and the loading skeleton. Mirrors the global level page's states.tsx
// so both level pages keep their error + skeleton markup out of the page file.

import { AlertCircle, Lock } from 'lucide-react'
import { BackLink } from '@/components/shell/BackLink'
import { cn } from '@/lib/utils'
import { MOBILE_HERO_CLASS, useWideLayout } from '@/lib/useWideLayout'
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
      className={cn(
        'animate-pulse rounded-card bg-bg-surface',
        // Mirrors HeroVideo's own sizing in each layout, so nothing jumps
        // when the real embed lands.
        desktop ? 'h-[383px]' : MOBILE_HERO_CLASS
      )}
    />
  )
}

function IdentitySkeleton({ desktop }: { desktop?: boolean }) {
  return (
    <div
      className={cn(
        'animate-pulse space-y-2',
        desktop ? 'px-5 py-5' : 'px-4 py-4'
      )}
    >
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

function StatGridSkeleton({ desktop }: { desktop?: boolean }) {
  return (
    <div
      className={cn(
        'grid gap-2',
        desktop ? 'grid-cols-3' : 'grid-cols-2 px-4 py-3'
      )}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'animate-pulse rounded-card bg-bg-surface',
            desktop ? 'h-[64px]' : 'h-[52px]'
          )}
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
  // Branches the same way the page does, so the skeleton is never the
  // opposite layout of the page that replaces it.
  const isWide = useWideLayout()

  return (
    <>
      {/* Back row skeleton */}
      <div
        className={cn(
          'border-b border-border-subtle',
          isWide ? 'mx-8 py-4' : 'px-4 py-3'
        )}
      >
        <div className="h-5 w-40 animate-pulse rounded bg-bg-subtle" />
      </div>

      {!isWide && (
        <div>
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
      )}

      {isWide && (
        <div className="mx-8 pb-16 pt-4">
          <div className="flex gap-6">
            <div className="min-w-0 flex-1 space-y-4">
              <HeroSkeleton desktop />
              <div className="animate-pulse rounded-card bg-bg-surface p-4">
                <IdentitySkeleton desktop />
                <StatGridSkeleton desktop />
              </div>
              <div className="h-32 animate-pulse rounded-card bg-bg-surface" />
            </div>
            <div className="w-[clamp(300px,34vw,428px)] shrink-0 space-y-4">
              <div className="animate-pulse rounded-card bg-bg-surface">
                <div className="h-12 border-b border-border-subtle" />
                <TimelineSkeleton />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
