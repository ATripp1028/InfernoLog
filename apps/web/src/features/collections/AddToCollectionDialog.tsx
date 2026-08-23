import { useRef } from 'react'
import { ArrowLeft, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import { LevelResultRow } from '@/components/data/LevelResultRow'
import { collectionIdentity, isBuiltIn, withAlpha } from './identity'
import { GdSearchSection } from '@/features/search/GdSearchSection'
import { SeededLevelPreviewCard } from './SeededLevelPreviewCard'
import { SectionLabel } from '@/components/inputs/SectionLabel'
import { Modal } from '@/components/generic/modal'
import {
  useAddToCollectionDialog,
  type PickedLevel,
} from './useAddToCollectionDialog'

interface AddToCollectionDialogProps {
  open: boolean
  onClose: () => void
  // When provided (e.g. from the level page), step 1 is skipped entirely.
  preselectedLevel?: PickedLevel
}

/**
 * Two-step flow for adding a level to one or more collections.
 *
 *   Step 1 (level search) — skipped when preselectedLevel is provided.
 *     Name search / cached ID / GD-server search result → click to proceed to
 *     step 2 (a GD result is seeded into the cache on the way).
 *     Unknown numeric ID → seed from RobTop → confirm → proceed to step 2.
 *
 *   Step 2 (collection picker) — searchable list with checkboxes.
 *     Confirm adds the level to all selected collections in parallel.
 *
 * All of that state lives in useAddToCollectionDialog; this file is markup.
 *
 * While a seed or the multi-collection add is in flight the dialog won't
 * close — the add writes to several collections at once, so a dismissal
 * mid-write leaves the user with no idea which ones took. The X fades out to
 * signal it. Searching is not "in flight" for this purpose.
 */
export function AddToCollectionDialog({
  open,
  onClose,
  preselectedLevel,
}: AddToCollectionDialogProps) {
  // Only one of the two search fields exists when the modal opens — the level
  // search, or the collection search when the caller preselected a level — so
  // one ref serves both.
  const openFocusRef = useRef<HTMLInputElement>(null)
  const {
    step,
    goBackToSearch,
    canGoBack,
    levelQuery,
    trimmed,
    updateLevelQuery,
    submitLevelQuery,
    escalation,
    searchPending,
    results,
    cachedLevel,
    showResults,
    showCachedPreview,
    showSeedHint,
    showEmptyPrompt,
    seedingId,
    pickingId,
    seededLevel,
    clearSeededLevel,
    seedAndPick,
    seedAndSelect,
    selectLevel,
    pickedLevel,
    collectionQuery,
    setCollectionQuery,
    collectionsLoading,
    collectionsFailed,
    hasBuiltIns,
    filteredCollections,
    selectedIds,
    levelAlreadyInCollectionIds,
    toggleCollection,
    handleAdd,
    isSubmitting,
  } = useAddToCollectionDialog({ open, onClose, preselectedLevel })

  const busy = isSubmitting || !!seedingId || !!pickingId

  // ── Step 1: level search ───────────────────────────────────────────

  const searchBody = (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-5">
      <div>
        <label
          htmlFor="atc-level-query"
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
            id="atc-level-query"
            ref={openFocusRef}
            value={levelQuery}
            onChange={(e) => updateLevelQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitLevelQuery()
            }}
            placeholder="Search by name or paste a level ID"
            className="h-12 pl-9 text-base"
          />
        </div>
      </div>

      {seedingId && (
        <div>
          <SectionLabel tone="secondary" className="mb-2">
            Results
          </SectionLabel>
          <div className="flex h-12 items-center gap-3 rounded-btn border border-border bg-bg-surface px-4 text-sm text-text-secondary">
            <Loader2 size={16} className="animate-spin text-primary" />
            Fetching level {seedingId} from the GD servers…
          </div>
        </div>
      )}

      {/* Seeded confirmation card — only for raw IDs, never a picked GD result. */}
      {seededLevel && !seedingId && (
        <SeededLevelPreviewCard
          level={seededLevel}
          badge={seededLevel.completed ? 'Already completed' : null}
          dimmed={seededLevel.completed}
          onChange={clearSeededLevel}
          description={
            seededLevel.completed
              ? "You already completed this level — Want to Beat won't be offered as an option next."
              : 'Continue to choose which collections to add it to.'
          }
        />
      )}

      {showCachedPreview && cachedLevel && (
        <div>
          <SectionLabel tone="secondary" className="mb-2">
            Results
          </SectionLabel>
          <div className="overflow-hidden rounded-md border border-border">
            <LevelResultRow
              level={cachedLevel}
              disabled={!!pickingId}
              onSelect={() => selectLevel(cachedLevel)}
            />
          </div>
        </div>
      )}

      {showSeedHint && (
        <div>
          <SectionLabel tone="secondary" className="mb-2">
            Results
          </SectionLabel>
          <button
            type="button"
            onClick={() => seedAndPick(trimmed)}
            className="flex h-12 w-full items-center gap-3 rounded-btn border border-border bg-bg-surface px-4 text-left text-sm text-text-primary transition-colors hover:bg-bg-subtle"
          >
            <Search size={16} className="text-text-tertiary" />
            Fetch level {trimmed} from the GD servers
          </button>
        </div>
      )}

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
                it.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              {results.map((r) => (
                <LevelResultRow
                  key={r.inGameId}
                  level={r}
                  disabled={!!pickingId}
                  onSelect={() => selectLevel(r)}
                />
              ))}
            </div>
          )}

          {!searchPending && (
            <div className="mt-3 overflow-hidden rounded-md border border-border">
              <GdSearchSection
                escalation={escalation}
                query={trimmed}
                onSelect={(levelId) => seedAndSelect(levelId)}
                loadingId={pickingId}
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

      {showEmptyPrompt && (
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-bg-subtle text-text-tertiary">
            <Search size={18} />
          </span>
          <p className="text-base font-semibold text-text-primary">
            Find a level
          </p>
          <p className="mx-auto mt-1.5 max-w-[300px] text-[13px] text-text-tertiary">
            Search your cache by name, or paste any level ID.
          </p>
        </div>
      )}
    </div>
  )

  // ── Step 2: collection picker ──────────────────────────────────────

  const pickBody = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {pickedLevel && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3.5">
          <DifficultyFace
            difficulty={pickedLevel.inGameDifficulty}
            featured={pickedLevel.featured}
            epicValue={pickedLevel.epicValue}
            rated={pickedLevel.isRated}
            size={64}
            className="shrink-0 drop-shadow"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-text-primary">
              {pickedLevel.name ?? `Level #${pickedLevel.inGameId}`}
            </span>
            <span className="block text-xs text-text-secondary">
              {pickedLevel.creator
                ? `by ${pickedLevel.creator}`
                : 'Unknown creator'}
            </span>
          </span>
        </div>
      )}

      <div className="shrink-0 border-b border-border px-5 py-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <Input
            ref={openFocusRef}
            value={collectionQuery}
            onChange={(e) => setCollectionQuery(e.target.value)}
            placeholder="Search collections…"
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {collectionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-text-tertiary" />
          </div>
        ) : collectionsFailed || !hasBuiltIns ? (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <p className="text-sm font-medium text-text-primary">
              {collectionsFailed
                ? "Couldn't load your collections"
                : 'Collections not set up yet'}
            </p>
            <p className="mt-1.5 text-[13px] text-text-tertiary">
              {collectionsFailed
                ? 'Check your connection and reload the page.'
                : 'Your built-in collections are missing. Try signing out and back in.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        ) : filteredCollections.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-text-tertiary">
            {collectionQuery
              ? `No collections match "${collectionQuery}"`
              : 'No collections yet'}
          </p>
        ) : (
          filteredCollections.map((c) => {
            const identity = collectionIdentity(c.type, c.id)
            const Icon = identity.icon
            const checked = selectedIds.has(c.id)
            const alreadyIn = levelAlreadyInCollectionIds.has(c.id)
            return (
              <label
                key={c.id}
                className={[
                  'flex items-center gap-3 border-b border-border-subtle px-5 py-3 last:border-b-0',
                  alreadyIn
                    ? 'cursor-not-allowed opacity-50'
                    : 'cursor-pointer hover:bg-bg-subtle',
                ].join(' ')}
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-[6px]"
                  style={{ backgroundColor: withAlpha(identity.color, 0.18) }}
                >
                  <Icon size={14} style={{ color: identity.color }} />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-text-primary truncate">
                  {c.name}
                </span>
                {alreadyIn ? (
                  <span className="shrink-0 text-[11px] text-text-tertiary">
                    Already added
                  </span>
                ) : (
                  <>
                    {isBuiltIn(c.type) && (
                      <span className="shrink-0 text-[11px] text-text-tertiary">
                        Built-in
                      </span>
                    )}
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleCollection(c.id, e.target.checked)}
                      className="size-4 accent-[var(--color-primary,#e8390e)]"
                    />
                  </>
                )}
              </label>
            )
          })
        )}
      </div>
    </div>
  )

  // ── Dialog shell ───────────────────────────────────────────────────

  const n = selectedIds.size

  const footer =
    step === 'pick' ? (
      <div className="flex items-center justify-between gap-3">
        {canGoBack ? (
          <button
            type="button"
            onClick={goBackToSearch}
            className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={14} />
            Change level
          </button>
        ) : (
          <span />
        )}
        <Button
          onClick={handleAdd}
          disabled={n === 0 || isSubmitting}
          className="min-w-[180px]"
        >
          {isSubmitting
            ? 'Adding…'
            : n === 0
              ? 'Select a collection'
              : `Add to ${n} collection${n === 1 ? '' : 's'}`}
        </Button>
      </div>
    ) : seededLevel ? (
      <div className="flex items-center justify-end gap-3">
        <Button
          onClick={() => selectLevel(seededLevel)}
          className="min-w-[180px]"
        >
          Continue
        </Button>
      </div>
    ) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="xl"
      tall
      divided
      eyebrow={
        step === 'search'
          ? 'Step 1 · Level'
          : !preselectedLevel
            ? 'Step 2 · Collections'
            : 'Collections'
      }
      title="Add to a Collection"
      autoFocusRef={openFocusRef}
      footer={footer}
    >
      {step === 'search' ? searchBody : pickBody}
    </Modal>
  )
}
