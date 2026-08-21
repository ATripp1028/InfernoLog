import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/generic/button'
import { DialogCloseButton } from '@/components/generic/dialog-close-button'
import { Input } from '@/components/generic/input'
import { LevelResultRow } from '@/components/data/LevelResultRow'
import { type CollectionDetail } from '@/lib/api/collections'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { GdSearchSection } from '@/features/search/GdSearchSection'
import { SeededLevelPreviewCard } from './SeededLevelPreviewCard'
import { SectionLabel } from '@/components/inputs/SectionLabel'
import { useAddLevelsDialog } from './useAddLevelsDialog'

interface AddLevelsDialogProps {
  open: boolean
  onClose: () => void
  collection: CollectionDetail
  // When provided, results whose level ID is in this set are greyed out with
  // an "Already beaten" label. Used by the Want to Beat wrapper.
  completedIds?: Set<string>
}

/**
 * Add-levels-to-collection flow. Two distinct paths:
 *
 *   A visible result — cache search, cached ID preview, or a GD-server search
 *   row — adds immediately on click (no confirmation needed: the row itself
 *   showed name, creator, ID and difficulty). A GD row is seeded into the
 *   cache first, which is a step to finish, not something to confirm.
 *
 *   Unknown numeric ID — "Fetch from GD servers" seeds the level from RobTop,
 *   then shows a confirmation card before adding, since the user typed a raw ID
 *   with no name visible.
 *
 * Both paths and all of their state live in useAddLevelsDialog.
 *
 * Whichever path is mid-flight, the dialog stops closing: a seed or an add is
 * a write the user hasn't seen the result of yet, and both paths reuse the
 * dialog afterwards ("add another"), so losing it to a stray backdrop click
 * would leave the user unsure whether the level landed. The X fades out while
 * that's true.
 */
export function AddLevelsDialog({
  open,
  onClose,
  collection,
  completedIds,
}: AddLevelsDialogProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const {
    query,
    trimmed,
    updateQuery,
    submitQuery,
    escalation,
    searchPending,
    results,
    cachedLevel,
    showResults,
    showCachedPreview,
    showSeedHint,
    showEmptyPrompt,
    rowBadge,
    addingId,
    isAdding,
    addLevel,
    seedAndSelect,
    seedAndAdd,
    pending,
    seeded,
    clearSeeded,
    seededAlreadyAdded,
    seededBlocked,
    confirmSeeded,
    canConfirm,
    addAnother,
    setAddAnother,
  } = useAddLevelsDialog({ open, onClose, collection, completedIds })

  // A seed (`pending`) or an add in flight — the two writes this dialog makes.
  // Searching doesn't count: it changes nothing, and trapping the user behind
  // a slow search would be worse than the stray click it prevents.
  const busy = isAdding || !!pending
  const requestClose = () => {
    if (!busy) onClose()
  }

  if (!open) return null

  const body = (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <div>
          <label
            htmlFor="collection-level-query"
            className="mb-2 block text-[13px] font-medium text-text-secondary"
          >
            Level ID or name
          </label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <Input
              id="collection-level-query"
              autoFocus={isDesktop}
              value={query}
              onChange={(e) => updateQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitQuery()
              }}
              placeholder="Search by name or paste a level ID"
              className="h-12 pl-9 text-base"
            />
          </div>
        </div>

        {/* Busy indicator. Covers both waits a picked GD result goes through
            (seed, then add), so the results list never flashes back between
            them, as well as the raw-ID seed on its own. */}
        {pending && (
          <div>
            <SectionLabel tone="secondary" className="mb-2">
              Results
            </SectionLabel>
            <div className="flex h-12 items-center gap-3 rounded-btn border border-border bg-bg-surface px-4 text-sm text-text-secondary">
              <Loader2 size={16} className="animate-spin text-primary" />
              {pending.phase === 'seeding'
                ? `Fetching level ${pending.levelId} from the GD servers…`
                : `Adding ${pending.name ?? `level ${pending.levelId}`} to ${collection.name}…`}
            </div>
            {pending.phase === 'seeding' && (
              <p className="mt-2 text-xs text-text-tertiary">
                New to InfernoLog — we&apos;ll add it to the shared cache so
                it&apos;s name-searchable next time.
              </p>
            )}
          </div>
        )}

        {/* Seeded confirmation card — only for raw IDs, never a picked GD result. */}
        {seeded && !pending && (
          <SeededLevelPreviewCard
            level={seeded}
            badge={
              seededBlocked
                ? 'Already completed'
                : seededAlreadyAdded
                  ? 'Added'
                  : null
            }
            dimmed={seededBlocked || seededAlreadyAdded}
            onChange={clearSeeded}
            description={
              seededBlocked
                ? 'You already beat this level — Want to Beat only holds unbeaten levels.'
                : seededAlreadyAdded
                  ? `This level is already in ${collection.name}.`
                  : `This level will be added to ${collection.name}.`
            }
          />
        )}

        {/* Cached preview for a typed numeric ID — direct add on click. */}
        {showCachedPreview && cachedLevel && (
          <div>
            <SectionLabel tone="secondary" className="mb-2">
              Results
            </SectionLabel>
            <div className="overflow-hidden rounded-md border border-border">
              <LevelResultRow
                level={cachedLevel}
                badge={rowBadge(cachedLevel.inGameId)}
                loading={addingId === cachedLevel.inGameId}
                disabled={isAdding}
                onSelect={() =>
                  addLevel(cachedLevel.inGameId, cachedLevel.name)
                }
              />
            </div>
          </div>
        )}

        {/* Unknown numeric ID — offer to seed from RobTop. */}
        {showSeedHint && (
          <div>
            <SectionLabel tone="secondary" className="mb-2">
              Results
            </SectionLabel>
            <button
              type="button"
              onClick={() => seedAndSelect(trimmed)}
              className="flex h-12 w-full items-center gap-3 rounded-btn border border-border bg-bg-surface px-4 text-left text-sm text-text-primary transition-colors hover:bg-bg-subtle"
            >
              <Search size={16} className="text-text-tertiary" />
              Fetch level {trimmed} from the GD servers
            </button>
          </div>
        )}

        {/* Name search results — direct add on click. */}
        {showResults && (
          <div>
            <SectionLabel tone="secondary" className="mb-2">
              Results
            </SectionLabel>
            {searchPending ? (
              <p className="px-1 text-sm text-text-tertiary">Searching…</p>
            ) : results.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-base font-semibold text-text-primary">
                  No levels match &ldquo;{trimmed}&rdquo;
                </p>
                <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] text-text-tertiary">
                  Nothing in your cache matched. If you know the level ID, paste
                  it to pull it in.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                {results.map((r) => (
                  <LevelResultRow
                    key={r.inGameId}
                    level={r}
                    badge={rowBadge(r.inGameId)}
                    loading={addingId === r.inGameId}
                    disabled={isAdding}
                    onSelect={() => addLevel(r.inGameId, r.name)}
                  />
                ))}
              </div>
            )}
            <p className="mt-2 px-1 text-xs text-text-tertiary">
              Paste a level ID to add one InfernoLog doesn&apos;t know yet —
              we&apos;ll fetch it from the GD servers.
            </p>

            {!searchPending && (
              <div className="mt-3 overflow-hidden rounded-md border border-border">
                <GdSearchSection
                  escalation={escalation}
                  query={trimmed}
                  onSelect={(levelId) => seedAndAdd(levelId)}
                  offer={{
                    title: `Search GD's servers for "${trimmed}"`,
                    subtitle:
                      'One request to RobTop. Levels already in your cache are omitted.',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Empty prompt. */}
        {showEmptyPrompt && (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-bg-subtle text-text-tertiary">
              <Search size={18} />
            </span>
            <p className="text-base font-semibold text-text-primary">
              Find a level to add
            </p>
            <p className="mx-auto mt-1.5 max-w-[300px] text-[13px] text-text-tertiary">
              Search your cache by name, or paste any level ID to pull it from
              the GD servers.
            </p>
          </div>
        )}
      </div>

      {/* Footer — checkbox always visible; confirm button only for seeded path. */}
      <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
        <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={addAnother}
            onChange={(e) => setAddAnother(e.target.checked)}
            className="size-5 accent-[var(--color-primary,#e8390e)]"
          />
          Add another after this
        </label>
        {seeded && (
          <Button
            onClick={confirmSeeded}
            disabled={!canConfirm}
            className="min-w-[150px]"
          >
            {isAdding ? 'Adding…' : 'Add to collection'}
          </Button>
        )}
      </div>
    </>
  )

  const header = (
    <div className="flex items-start justify-between border-b border-border px-6 pb-3 pt-3.5">
      <div>
        <SectionLabel tone="primary">
          Collection · {collection.name}
        </SectionLabel>
        <h2 className="mt-0.5 text-lg font-bold text-text-primary">
          Add levels
        </h2>
      </div>
      <DialogCloseButton
        onClick={requestClose}
        disabled={busy}
        className="mt-1 size-9 hover:bg-bg-subtle hover:text-text-primary"
      />
    </div>
  )

  if (isDesktop) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) requestClose()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') requestClose()
        }}
      >
        <div className="flex max-h-[80vh] min-h-[520px] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          {header}
          {body}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        disabled={busy}
        className="absolute inset-0 bg-black/55"
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] min-h-[70dvh] flex-col overflow-hidden rounded-t-card border-t border-border bg-bg-surface shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </div>
        {header}
        {body}
      </div>
    </div>
  )
}
