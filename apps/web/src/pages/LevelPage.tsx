import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { BackLink } from '@/components/BackLink'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { HeroVideo } from '@/features/level-page/HeroVideo'
import { IdentityStrip } from '@/features/level-page/IdentityStrip'
import { StatGrid } from '@/features/level-page/StatGrid'
import { LevelNotes } from '@/features/level-page/LevelNotes'
import { Timeline } from '@/features/level-page/Timeline'
import { RunsGraph } from '@/features/level-page/RunsGraph'
import { EditRunModal } from '@/features/level-page/EditRunModal'
import { EditLevelModal } from '@/features/level-page/EditLevelModal'
import { AddToCollectionDialog } from '@/features/collections/AddToCollectionDialog'
import {
  LevelPageSkeleton,
  LoadFailed,
  NotFound,
  PrivateProfile,
} from '@/features/level-page/states'
import { useLevelDetailPage } from '@/features/level-page/useLevelDetailPage'

export function LevelPage() {
  const {
    levelId,
    back,
    status,
    data,
    user,
    isOwner,
    levelName,
    hasVideo,
    hasGraph,
    totalEntries,
    editRunOpen,
    editRunProgressUpdateId,
    openEditRun,
    closeEditRun,
    editLevelOpen,
    openEditLevel,
    closeEditLevel,
    addToCollectionOpen,
    setAddToCollectionOpen,
    pendingDelete,
    setPendingDelete,
    handleDeleteConfirm,
    isDeletingLevel,
    pendingDeleteUpdateId,
    setPendingDeleteUpdateId,
    handleDeleteEntryConfirm,
    isDeletingEntry,
    pendingGddlSubmit,
    setPendingGddlSubmit,
    handleGddlSubmitConfirm,
    isSubmittingGddl,
  } = useLevelDetailPage()

  // ── Loading / error states ──
  if (status === 'loading') return <LevelPageSkeleton />
  if (status === 'private') return <PrivateProfile />
  if (status === 'not-found') return <NotFound levelId={levelId} back={back} />
  if (status === 'error') return <LoadFailed />
  if (!data || !user) return null

  const {
    ratingDisplayScale,
    dateFormatPreference,
    ratingMode,
    includeEnjoyment,
    enjoymentWeight,
    ratingCategories,
  } = user

  return (
    <>
      {/* Back navigation row */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3 md:mx-8 md:border-b md:px-0 md:py-4">
        <BackLink
          back={back}
          ariaLabel="Back"
          className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={18} />
        </BackLink>
        <span className="text-sm font-medium text-text-primary truncate">
          {levelName}
        </span>
        {/* Reciprocal cross-link to the community-facing Global Level Page —
            the other half of the two-way link. Always valid here: this page
            only renders when a LevelProgress row exists. `state` inherits
            the remembered origin unchanged so the pair acts as one hop. */}
        <Link
          to="/levels/$levelId"
          params={{ levelId }}
          state={true}
          className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-[var(--color-primary-light)] transition hover:brightness-110"
        >
          Global level page
          <span aria-hidden>→</span>
        </Link>
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
          <IdentityStrip level={data.level} variant="mobile" />
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
            onEdit={openEditLevel}
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
              onEdit={openEditRun}
              onDelete={setPendingDeleteUpdateId}
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
                <IdentityStrip level={data.level} variant="desktop" />
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
                onEdit={openEditLevel}
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
                    onEdit={openEditRun}
                    onDelete={setPendingDeleteUpdateId}
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

      {/* Edit run modal */}
      {isOwner && (
        <EditRunModal
          open={editRunOpen}
          onClose={closeEditRun}
          data={data}
          levelId={levelId}
          scale={ratingDisplayScale}
          datePref={dateFormatPreference}
          progressUpdateId={editRunProgressUpdateId}
        />
      )}

      {/* Edit level details modal */}
      {isOwner && (
        <EditLevelModal
          open={editLevelOpen}
          onClose={closeEditLevel}
          data={data}
          levelId={levelId}
          scale={ratingDisplayScale}
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
        isPending={isDeletingLevel}
        onConfirm={handleDeleteConfirm}
      />

      {/* Delete entry confirmation */}
      <AlertDialog
        open={pendingDeleteUpdateId != null}
        onOpenChange={(o) => !o && setPendingDeleteUpdateId(null)}
        title="Delete this entry?"
        description={
          totalEntries <= 1
            ? `This is the only logged entry for "${levelName}" — deleting it removes the level from your list entirely. This can't be undone.`
            : "This removes this logged entry permanently. This can't be undone."
        }
        confirmLabel="Delete"
        destructive
        isPending={isDeletingEntry}
        onConfirm={handleDeleteEntryConfirm}
      />

      {/* GDDL submit confirmation */}
      <AlertDialog
        open={pendingGddlSubmit}
        onOpenChange={(o) => !o && setPendingGddlSubmit(false)}
        title="Submit to GDDL?"
        description="Sends your completion to the GD Ladder using your connected API key."
        confirmLabel="Submit"
        isPending={isSubmittingGddl}
        onConfirm={handleGddlSubmitConfirm}
      />
    </>
  )
}
