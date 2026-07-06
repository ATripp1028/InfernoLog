import { Link, useParams, useNavigate } from '@tanstack/react-router'
import { AlertCircle, ArrowLeft, Lock } from 'lucide-react'
import { useMe } from '@/lib/api/me'
import { useLevelPage } from '@/lib/api/levelPage'
import { useDeleteProgress } from '@/lib/api/list'
import { useSubmitGddlRecord } from '@/lib/api/logging'
import { ApiError } from '@/lib/api/client'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { toast } from '@/components/ui/sonner'
import { HeroVideo } from '@/features/level-page/HeroVideo'
import { IdentityStrip } from '@/features/level-page/IdentityStrip'
import { StatGrid } from '@/features/level-page/StatGrid'
import { LevelNotes } from '@/features/level-page/LevelNotes'
import { Timeline } from '@/features/level-page/Timeline'
import { RunsGraph } from '@/features/level-page/RunsGraph'
import { LevelFab } from '@/features/level-page/LevelFab'
import { EditProgressModal } from '@/features/level-page/EditProgressModal'
import { AddToCollectionDialog } from '@/features/collections/AddToCollectionDialog'
import { useState } from 'react'

// ─── Error states ──────────────────────────────────────────────────

function PrivateProfile() {
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

function NotFound({ levelId }: { levelId: string }) {
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
      <Link
        to="/list"
        className="mt-2 text-sm text-[var(--color-primary-light)] hover:underline"
      >
        ← Back to List
      </Link>
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

// ─── Main page ─────────────────────────────────────────────────────

export function LevelPage() {
  const { levelId } = useParams({ from: '/_authenticated/list/$levelId' })
  const navigate = useNavigate()
  const me = useMe()
  const deleteProgress = useDeleteProgress()

  const [pendingDelete, setPendingDelete] = useState(false)
  const [pendingGddlSubmit, setPendingGddlSubmit] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editProgressUpdateId, setEditProgressUpdateId] = useState<string | null>(null)
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false)
  const submitGddlRecord = useSubmitGddlRecord()

  const query = useLevelPage(levelId)

  // Resolve error types before rendering
  const is403 = query.error instanceof ApiError && query.error.status === 403
  const is404 = query.error instanceof ApiError && query.error.status === 404

  function handleDeleteConfirm() {
    deleteProgress.mutate(levelId, {
      onSuccess: () => {
        toast.success('Level deleted')
        void navigate({ to: '/list' })
      },
      onError: () => {
        toast.error('Failed to delete level')
      },
    })
  }

  function handleEditLevel() {
    setEditOpen(true)
  }

  function handleGddlSubmitConfirm() {
    submitGddlRecord.mutate(levelId, {
      onSuccess: () => toast.success('Submitted to GDDL'),
      onError: () => toast.error('Failed to submit to GDDL'),
    })
  }

  // ── Loading / error states ──
  if (me.isPending || (query.isPending && !is403 && !is404)) {
    return <LevelPageSkeleton />
  }

  if (is403) return <PrivateProfile />
  if (is404) return <NotFound levelId={levelId} />

  if (query.error && !query.data) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <p className="text-sm text-text-secondary">
          Something went wrong loading this level.
        </p>
      </div>
    )
  }

  if (!query.data || !me.data) return null

  const { data } = query
  const {
    ratingDisplayScale,
    dateFormatPreference,
    ratingMode,
    includeEnjoyment,
    enjoymentWeight,
    ratingCategories,
  } = me.data
  const isOwner = data.levelProgressId != null
  const levelName = data.level.name ?? `Level #${levelId}`

  const completion = data.progressUpdates.find((u) => u.isCompletion)

  const hasVideo = !!data.completionVideoUrl
  const hasGraph = data.runsGraph.length > 0
  const totalEntries = data.progressUpdates.length
  const hasCompletion = completion != null
  const canSubmitToGddl =
    isOwner && hasCompletion && (me.data.hasGddlApiKey ?? false)

  return (
    <>
      {/* Back navigation row */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3 md:mx-8 md:border-b md:px-0 md:py-4">
        <Link
          to="/list"
          className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
          aria-label="Back to List"
        >
          <ArrowLeft size={18} />
        </Link>
        <span className="text-sm font-medium text-text-primary truncate">
          {levelName}
        </span>
      </div>

      {/* ── Mobile layout ─────────────────────────────────────── */}
      <div className="md:hidden">
        {hasVideo && (
          <HeroVideo
            url={data.completionVideoUrl!}
            className="h-[219px] w-full"
          />
        )}

        <div className="border-b border-border-subtle">
          <IdentityStrip
            level={data.level}
            variant="mobile"
          />
        </div>

        <StatGrid
          data={data}
          datePref={dateFormatPreference}
          scale={ratingDisplayScale}
          ratingMode={ratingMode}
          includeEnjoyment={includeEnjoyment}
          enjoymentWeight={enjoymentWeight}
          ratingCategories={ratingCategories}
        />

        <div className="mt-4 border-t border-border-subtle px-4 py-4">
          <LevelNotes
            notes={data.levelNotes}
            isOwner={isOwner}
            onEdit={handleEditLevel}
          />
        </div>

        <div className="border-t border-border-subtle">
          <div className="flex items-baseline gap-2 px-4 py-3">
            <span className="text-[13px] font-medium text-text-primary">
              Progress timeline
            </span>
            <span className="text-xs text-text-tertiary">
              {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <div className="px-4 pb-4">
            <Timeline
              data={data}
              datePref={dateFormatPreference}
              isOwner={isOwner}
              onEdit={(id) => { setEditProgressUpdateId(id); setEditOpen(true) }}
            />
          </div>
        </div>

        {hasGraph && (
          <div className="border-t border-border-subtle px-4 py-4">
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-[13px] font-medium text-text-primary">
                Runs over time
              </span>
              <span className="text-[11px] text-text-tertiary">
                oldest → newest
              </span>
            </div>
            <RunsGraph entries={data.runsGraph} />
          </div>
        )}
      </div>

      {/* ── Desktop layout ─────────────────────────────────────── */}
      <div className="hidden md:block">
        <div className="mx-8 pb-16 pt-4">
          <div className="flex gap-6">
            {/* Left column — hero + identity card + stats + notes */}
            <div className="min-w-0 flex-1">
              {hasVideo && (
                <HeroVideo
                  url={data.completionVideoUrl!}
                  className="mb-4 h-[383px] w-full rounded-card"
                />
              )}

              {/* Identity card */}
              <div className="mb-4 overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
                <IdentityStrip
                  level={data.level}
                        variant="desktop"
                />
                <div className="p-4">
                  <StatGrid
                    data={data}
                    datePref={dateFormatPreference}
                    scale={ratingDisplayScale}
                    ratingMode={ratingMode}
                    includeEnjoyment={includeEnjoyment}
                    enjoymentWeight={enjoymentWeight}
                    ratingCategories={ratingCategories}
                  />
                </div>
              </div>

              {/* Notes */}
              <LevelNotes
                notes={data.levelNotes}
                isOwner={isOwner}
                onEdit={handleEditLevel}
              />
            </div>

            {/* Right column — timeline panel + runs graph */}
            <div className="w-[428px] shrink-0 space-y-4">
              {/* Timeline panel */}
              <div className="overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
                <div className="flex items-baseline gap-2 border-b border-border-subtle px-5 py-4">
                  <span className="text-[15px] font-medium text-text-primary">
                    Progress timeline
                  </span>
                  <span className="text-xs text-text-tertiary">
                    {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <div className="px-5 pb-4">
                  <Timeline
                    data={data}
                    datePref={dateFormatPreference}
                    isOwner={isOwner}
                    onEdit={(id) => { setEditProgressUpdateId(id); setEditOpen(true) }}
                  />
                </div>
              </div>

              {/* Runs graph panel */}
              {hasGraph && (
                <div className="overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
                  <div className="flex items-baseline gap-2 border-b border-border-subtle px-5 py-4">
                    <span className="text-[15px] font-medium text-text-primary">
                      Runs over time
                    </span>
                    <span className="text-[11px] text-text-tertiary">
                      oldest → newest
                    </span>
                  </div>
                  <div className="px-5 pb-5 pt-3">
                    <RunsGraph entries={data.runsGraph} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FAB — shown for all owned entries */}
      {isOwner && (
        <LevelFab
          onEdit={handleEditLevel}
          onDelete={() => setPendingDelete(true)}
          onAddToCollection={() => setAddToCollectionOpen(true)}
          {...(canSubmitToGddl
            ? { onGddlSubmit: () => setPendingGddlSubmit(true) }
            : {})}
        />
      )}

      {/* Edit modal */}
      {isOwner && (
        <EditProgressModal
          open={editOpen}
          onClose={() => { setEditOpen(false); setEditProgressUpdateId(null) }}
          data={data}
          levelId={levelId}
          scale={ratingDisplayScale}
          progressUpdateId={editProgressUpdateId}
        />
      )}

      {/* Add to collection */}
      <AddToCollectionDialog
        open={addToCollectionOpen}
        onClose={() => setAddToCollectionOpen(false)}
        preselectedLevel={data.level}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(false)}
        title="Delete this level?"
        description={`This removes "${levelName}" and all its logged progress permanently. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />

      {/* GDDL submit confirmation */}
      <AlertDialog
        open={pendingGddlSubmit}
        onOpenChange={(o) => !o && setPendingGddlSubmit(false)}
        title="Submit to GDDL?"
        description="Sends your completion to the GD Ladder using your connected API key."
        confirmLabel="Submit"
        onConfirm={handleGddlSubmitConfirm}
      />
    </>
  )
}

// ─── Loading skeleton layout ───────────────────────────────────────

function LevelPageSkeleton() {
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
