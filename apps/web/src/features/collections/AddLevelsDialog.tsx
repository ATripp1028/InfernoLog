// Add-levels-to-collection flow (mocks 1236:2 / 1237:2 desktop, 1239:2 /
// 1240:2 mobile sheet; search states 1251:2). Single-level resolve → confirm,
// sharing the logging flow's cache search + RobTop seeding:
//   • name queries search the shared level cache (useLevelSearch)
//   • numeric IDs preview from the cache (useLevelById) and unknown IDs seed
//     via GET /levels/:id/resolve, with a non-blocking inline loading row
// Duplicates already in the collection render greyed with an "Added" tag.
// In Want to Beat, a resolved level the user already beat renders the same
// greyed treatment ("Already completed") and cannot be added.

import { useEffect, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DifficultyFace } from '@/components/DifficultyFace'
import { ApiError } from '@/lib/api/client'
import {
  useLevelById,
  useLevelSearch,
  useResolveLevel,
  type Level,
} from '@/lib/api/logging'
import {
  collectionErrorCode,
  useAddCollectionEntry,
  type CollectionDetail,
} from '@/lib/api/collections'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'

interface AddLevelsDialogProps {
  open: boolean
  onClose: () => void
  collection: CollectionDetail
}

interface SelectedLevel {
  inGameId: string
  name: string | null
  creator: string | null
  inGameDifficulty: string | null
  featured: boolean | null
  epicValue: number | null
  isRated: boolean
  // Only known after a resolve; drives the Want to Beat completed gate.
  completed: boolean
}

export function AddLevelsDialog({
  open,
  onClose,
  collection,
}: AddLevelsDialogProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SelectedLevel | null>(null)
  const [addAnother, setAddAnother] = useState(false)
  // The unknown ID currently being fetched from the GD servers (seeding row).
  const [seedingId, setSeedingId] = useState<string | null>(null)

  const resolveLevel = useResolveLevel()
  const addEntry = useAddCollectionEntry()

  const trimmed = query.trim()
  const isNumeric = /^\d+$/.test(trimmed)
  const search = useLevelSearch(query)
  const cachedLevel = useLevelById(trimmed)

  const inCollection = new Set(collection.entries.map((e) => e.level.inGameId))
  const isWantToBeat = collection.type === 'WANT_TO_BEAT'

  // Reset per open; "Add another" persists checked across adds within a
  // session but starts unchecked each time the dialog opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(null)
      setAddAnother(false)
      setSeedingId(null)
    }
  }, [open])

  if (!open) return null

  // Select a level that's already in our cache — no network call needed.
  // `completed` defaults to false; if wrong, the API will reject with
  // LEVEL_ALREADY_COMPLETED and the catch block surfaces the right toast.
  function selectKnown(level: Pick<Level, 'inGameId' | 'name' | 'creator' | 'inGameDifficulty' | 'featured' | 'epicValue' | 'isRated'>) {
    setSelected({
      inGameId: level.inGameId,
      name: level.name,
      creator: level.creator,
      inGameDifficulty: level.inGameDifficulty,
      featured: level.featured,
      epicValue: level.epicValue,
      isRated: level.isRated,
      completed: false,
    })
    setQuery('')
  }

  // Seed an unknown numeric ID from RobTop, then hold the result as SELECTED.
  async function seedAndSelect(levelId: string) {
    setSeedingId(levelId)
    try {
      const res = await resolveLevel.mutateAsync(levelId)
      if (!res.level) {
        toast.error(
          'That level could not be fetched from the GD servers. Log it once to add it manually.'
        )
        return
      }
      setSelected({
        inGameId: res.level.inGameId,
        name: res.level.name,
        creator: res.level.creator,
        inGameDifficulty: res.level.inGameDifficulty,
        featured: res.level.featured,
        epicValue: res.level.epicValue,
        isRated: res.level.isRated,
        completed: res.existingCompletion !== null,
      })
      setQuery('')
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not look up that level'
      )
    } finally {
      setSeedingId(null)
    }
  }

  const alreadyAdded = !!selected && inCollection.has(selected.inGameId)
  const blockedCompleted = !!selected && isWantToBeat && selected.completed
  const canAdd = !!selected && !blockedCompleted && !addEntry.isPending

  async function handleAdd() {
    if (!selected || !canAdd) return
    try {
      await addEntry.mutateAsync({
        collectionId: collection.id,
        levelId: selected.inGameId,
      })
      toast.success(
        alreadyAdded
          ? `${selected.name ?? 'Level'} is already in ${collection.name}`
          : `Added ${selected.name ?? 'level'} to ${collection.name}`
      )
      if (addAnother) {
        setSelected(null)
        setQuery('')
      } else {
        onClose()
      }
    } catch (err) {
      const code = collectionErrorCode(err)
      toast.error(
        code === 'LEVEL_ALREADY_COMPLETED'
          ? 'Already completed — Want to Beat only holds unbeaten levels'
          : err instanceof ApiError
            ? err.message
            : 'Could not add that level'
      )
    }
  }

  const showResults = !isNumeric && trimmed.length >= 2 && !seedingId
  const showCachedPreview =
    isNumeric && trimmed.length >= 4 && !!cachedLevel.data && !seedingId
  const showSeedHint =
    isNumeric &&
    trimmed.length >= 4 &&
    !cachedLevel.data &&
    !cachedLevel.isFetching &&
    !seedingId

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
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isNumeric) {
                  if (cachedLevel.data) selectKnown(cachedLevel.data)
                  else void seedAndSelect(trimmed)
                }
              }}
              placeholder="Search by name or paste a level ID"
              className="h-12 pl-9 text-base"
            />
          </div>
        </div>

        {/* Seeding an unknown ID — inline, non-blocking (mock state 3). */}
        {seedingId && (
          <div>
            <SectionLabel>Results</SectionLabel>
            <div className="flex h-12 items-center gap-3 rounded-btn border border-border bg-bg-surface px-4 text-sm text-text-secondary">
              <Loader2 size={16} className="animate-spin text-primary" />
              Fetching level {seedingId} from the GD servers…
            </div>
            <p className="mt-2 text-xs text-text-tertiary">
              New to InfernoLog — we&apos;ll add it to the shared cache so
              it&apos;s name-searchable next time.
            </p>
          </div>
        )}

        {/* SELECTED candidate → confirm (mock 1237:2). */}
        {selected && !seedingId && (
          <div>
            <SectionLabel>Selected</SectionLabel>
            <div
              className={cn(
                'flex items-center gap-3 rounded-btn border px-4 py-3.5',
                blockedCompleted || alreadyAdded
                  ? 'border-border bg-bg-surface opacity-60'
                  : 'border-primary/50 bg-primary/10'
              )}
            >
              <DifficultyFace
                difficulty={selected.inGameDifficulty}
                featured={selected.featured}
                epicValue={selected.epicValue}
                rated={selected.isRated}
                size={72}
                className="drop-shadow"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-text-primary">
                  {selected.name ?? `Level #${selected.inGameId}`}
                </span>
                <span className="block truncate text-[13px] text-text-secondary">
                  {[
                    selected.creator ? `by ${selected.creator}` : null,
                    selected.inGameDifficulty,
                    `#${selected.inGameId}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {(blockedCompleted || alreadyAdded) && (
                <span className="shrink-0 rounded bg-bg-subtle px-2 py-1 text-[11px] font-medium text-text-tertiary">
                  {alreadyAdded ? 'Added' : 'Already completed'}
                </span>
              )}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="shrink-0 text-sm font-medium text-primary hover:underline"
              >
                Change
              </button>
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              {blockedCompleted
                ? 'You already beat this level — Want to Beat only holds unbeaten levels.'
                : alreadyAdded
                  ? `This level is already in ${collection.name}.`
                  : `This level will be added to ${collection.name}.`}
            </p>
          </div>
        )}

        {/* Cached preview for a typed numeric ID. */}
        {!selected && showCachedPreview && cachedLevel.data && (
          <div>
            <SectionLabel>Results</SectionLabel>
            <div className="overflow-hidden rounded-btn border border-border">
              <CandidateRow
                level={cachedLevel.data}
                added={inCollection.has(cachedLevel.data.inGameId)}
                disabled={resolveLevel.isPending}
                onSelect={() => selectKnown(cachedLevel.data!)}
              />
            </div>
          </div>
        )}

        {/* Unknown numeric ID → offer to fetch/seed it. */}
        {!selected && showSeedHint && (
          <div>
            <SectionLabel>Results</SectionLabel>
            <button
              type="button"
              onClick={() => void seedAndSelect(trimmed)}
              className="flex h-12 w-full items-center gap-3 rounded-btn border border-border bg-bg-surface px-4 text-left text-sm text-text-primary transition-colors hover:bg-bg-subtle"
            >
              <Search size={16} className="text-text-tertiary" />
              Fetch level {trimmed} from the GD servers
            </button>
          </div>
        )}

        {/* Name-search results; duplicates greyed with an "Added" tag. */}
        {!selected && showResults && (
          <div>
            <SectionLabel>Results</SectionLabel>
            {search.isPending ? (
              <p className="px-1 text-sm text-text-tertiary">Searching…</p>
            ) : (search.data ?? []).length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-base font-semibold text-text-primary">
                  No levels match &ldquo;{trimmed}&rdquo;
                </p>
                <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] text-text-tertiary">
                  Nothing in your cache matched. If you know the level ID,
                  paste it to pull it in.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-btn border border-border">
                {(search.data ?? []).map((r) => (
                  <CandidateRow
                    key={r.inGameId}
                    level={r}
                    added={inCollection.has(r.inGameId)}
                    disabled={resolveLevel.isPending}
                    onSelect={() => selectKnown(r)}
                  />
                ))}
              </div>
            )}
            <p className="mt-2 px-1 text-xs text-text-tertiary">
              Paste a level ID to add one InfernoLog doesn&apos;t know yet —
              we&apos;ll fetch it. Levels already in this collection are greyed
              out.
            </p>
          </div>
        )}

        {/* Empty prompt (mock state 1). */}
        {!selected &&
          !showResults &&
          !showCachedPreview &&
          !showSeedHint &&
          !seedingId && (
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
              <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-bg-subtle text-text-tertiary">
                <Search size={18} />
              </span>
              <p className="text-base font-semibold text-text-primary">
                Find a level to add
              </p>
              <p className="mx-auto mt-1.5 max-w-[300px] text-[13px] text-text-tertiary">
                Search your cache by name, or paste any level ID to pull it
                from the GD servers.
              </p>
            </div>
          )}
      </div>

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
        <Button
          onClick={() => void handleAdd()}
          disabled={!canAdd}
          className="min-w-[150px]"
        >
          {addEntry.isPending ? 'Adding…' : 'Add to collection'}
        </Button>
      </div>
    </>
  )

  const header = (
    <div className="flex items-start justify-between border-b border-border px-6 pb-3 pt-3.5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.4px] text-primary">
          Collection · {collection.name}
        </p>
        <h2 className="mt-0.5 text-lg font-bold text-text-primary">
          Add levels
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
        <div className="flex max-h-[80vh] min-h-[520px] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          {header}
          {body}
        </div>
      </div>
    )
  }

  // Mobile — bottom sheet (mocks 1239:2 / 1240:2).
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/55"
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] min-h-[70dvh] flex-col overflow-hidden rounded-t-card border-t border-border bg-bg-elevated shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </div>
        {header}
        {body}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.4px] text-text-secondary">
      {children}
    </p>
  )
}

// One search-result / cached-preview row. `added` rows are greyed with an
// "Added" pill and not selectable (mock 1236:2).
function CandidateRow({
  level,
  added,
  disabled,
  onSelect,
}: {
  level: Pick<
    Level,
    | 'inGameId'
    | 'name'
    | 'creator'
    | 'inGameDifficulty'
    | 'featured'
    | 'epicValue'
    | 'isRated'
  >
  added: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const meta = [
    level.creator ? `by ${level.creator}` : null,
    level.inGameDifficulty,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <button
      type="button"
      disabled={disabled || added}
      onClick={onSelect}
      className={cn(
        'flex h-16 w-full items-center gap-3 border-b border-border-subtle bg-bg-surface px-4 text-left transition-colors last:border-b-0',
        added
          ? 'cursor-not-allowed opacity-50'
          : 'hover:bg-bg-subtle disabled:opacity-60'
      )}
    >
      <DifficultyFace
        difficulty={level.inGameDifficulty}
        featured={level.featured}
        epicValue={level.epicValue}
        rated={level.isRated}
        size={72}
        className="shrink-0 drop-shadow"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium leading-tight text-text-primary">
          {level.name ?? `Level #${level.inGameId}`}
        </span>
        {meta && (
          <span className="block truncate text-xs text-text-secondary">
            {meta}
          </span>
        )}
      </span>
      {added ? (
        <span className="shrink-0 rounded bg-bg-subtle px-2 py-1 text-[11px] font-medium text-text-tertiary">
          Added
        </span>
      ) : (
        <span className="shrink-0 font-mono text-xs text-text-secondary">
          #{level.inGameId}
        </span>
      )}
    </button>
  )
}
