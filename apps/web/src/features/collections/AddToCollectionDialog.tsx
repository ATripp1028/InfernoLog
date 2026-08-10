// Two-step flow for adding a level to one or more collections.
//
//   Step 1 (level search) — skipped when preselectedLevel is provided.
//     Name search / cached ID → click to proceed to step 2.
//     Unknown numeric ID → seed from RobTop → proceed to step 2.
//
//   Step 2 (collection picker) — searchable list with checkboxes.
//     Confirm adds the level to all selected collections in parallel.
//
// All of that state lives in useAddToCollectionDialog; this file is markup.

import { ArrowLeft, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DifficultyFace } from '@/components/DifficultyFace'
import { collectionIdentity, isBuiltIn, withAlpha } from './identity'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { GdSearchSection } from '@/features/search/GdSearchSection'
import { SeededLevelPreviewCard, SectionLabel } from './SeededLevelPreviewCard'
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

export function AddToCollectionDialog({
  open,
  onClose,
  preselectedLevel,
}: AddToCollectionDialogProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
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
    seededLevel,
    clearSeededLevel,
    seedAndPick,
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

  if (!open) return null

  // ── Step 1: level search ───────────────────────────────────────────

  const searchBody = (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
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
            autoFocus={isDesktop}
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
          <SectionLabel>Results</SectionLabel>
          <div className="flex h-12 items-center gap-3 rounded-btn border border-border bg-bg-surface px-4 text-sm text-text-secondary">
            <Loader2 size={16} className="animate-spin text-primary" />
            Fetching level {seedingId} from the GD servers…
          </div>
        </div>
      )}

      {/* Seeded confirmation card — only for unknown IDs fetched from RobTop. */}
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
          <SectionLabel>Results</SectionLabel>
          <div className="overflow-hidden rounded-md border border-border">
            <ResultRow
              levelId={cachedLevel.inGameId}
              name={cachedLevel.name}
              creator={cachedLevel.creator}
              songName={cachedLevel.songName}
              inGameDifficulty={cachedLevel.inGameDifficulty}
              featured={cachedLevel.featured}
              epicValue={cachedLevel.epicValue}
              isRated={cachedLevel.isRated}
              onSelect={() => selectLevel(cachedLevel)}
            />
          </div>
        </div>
      )}

      {showSeedHint && (
        <div>
          <SectionLabel>Results</SectionLabel>
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
          <SectionLabel>Results</SectionLabel>
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
                <ResultRow
                  key={r.inGameId}
                  levelId={r.inGameId}
                  name={r.name}
                  creator={r.creator}
                  songName={r.songName}
                  inGameDifficulty={r.inGameDifficulty}
                  featured={r.featured}
                  epicValue={r.epicValue}
                  isRated={r.isRated}
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
                onSelect={(levelId) => seedAndPick(levelId)}
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
            autoFocus={isDesktop && !!preselectedLevel}
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
          <div className="flex flex-col items-center px-6 py-10 text-center">
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
          <p className="px-6 py-8 text-center text-sm text-text-tertiary">
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

  const header = (
    <div className="flex items-start justify-between border-b border-border px-6 pb-3 pt-3.5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.4px] text-primary">
          {step === 'search'
            ? 'Step 1 · Level'
            : !preselectedLevel
              ? 'Step 2 · Collections'
              : 'Collections'}
        </p>
        <h2 className="mt-0.5 text-lg font-bold text-text-primary">
          Add to a Collection
        </h2>
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="mt-1 flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
      >
        <X size={16} />
      </button>
    </div>
  )

  const footer =
    step === 'pick' ? (
      <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
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
      <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        <Button
          onClick={() => selectLevel(seededLevel)}
          className="min-w-[180px]"
        >
          Continue
        </Button>
      </div>
    ) : null

  const innerBody = step === 'search' ? searchBody : pickBody

  if (isDesktop) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="flex max-h-[80vh] min-h-[520px] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          {header}
          {innerBody}
          {footer}
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
        className="absolute inset-0 bg-black/55"
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] min-h-[70dvh] flex-col overflow-hidden rounded-t-card border-t border-border bg-bg-surface shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </div>
        {header}
        {innerBody}
        {footer}
      </div>
    </div>
  )
}

function ResultRow({
  levelId,
  name,
  creator,
  songName,
  inGameDifficulty,
  featured,
  epicValue,
  isRated,
  onSelect,
}: {
  levelId: string
  name: string | null
  creator: string | null
  songName: string | null
  inGameDifficulty: string | null
  featured: boolean | null
  epicValue: number | null
  isRated: boolean
  onSelect: () => void
}) {
  const meta = [creator ? `by ${creator}` : null, songName]
    .filter(Boolean)
    .join(' · ')
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex h-16 w-full items-center justify-between gap-3 overflow-hidden border-b border-border-subtle bg-bg-surface px-4 text-left transition-colors last:border-b-0"
    >
      <img
        src={levelThumbnailUrl(levelId)}
        alt=""
        aria-hidden
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
        className="absolute inset-0 size-full object-cover"
      />
      <span className="absolute inset-0 bg-gradient-to-r from-bg-base/95 via-bg-base/85 to-bg-base/55" />
      <span className="absolute inset-0 bg-white/0 transition-colors group-hover:bg-white/5" />
      <span className="relative flex items-center gap-3">
        <DifficultyFace
          difficulty={inGameDifficulty}
          featured={featured}
          epicValue={epicValue}
          rated={isRated}
          size={100}
          className="translate-y-[3px] drop-shadow"
        />
        <span>
          <span className="block font-medium leading-tight text-text-primary">
            {name ?? `Level #${levelId}`}
          </span>
          {meta && (
            <span className="block text-xs text-text-secondary">{meta}</span>
          )}
        </span>
      </span>
      <span className="relative font-mono text-xs text-text-secondary">
        #{levelId}
      </span>
    </button>
  )
}
