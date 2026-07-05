// Add-levels-to-collection flow. Two distinct paths:
//
//   Name search / cached ID — clicking a result adds immediately (no confirmation
//   needed — the user can see exactly what they're clicking).
//
//   Unknown numeric ID — "Fetch from GD servers" seeds the level from RobTop,
//   then shows a confirmation card before adding, since the user typed a raw ID
//   with no name visible.

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
  type LevelSearchResult,
} from '@/lib/api/logging'
import {
  collectionErrorCode,
  useAddCollectionEntry,
  type CollectionDetail,
} from '@/lib/api/collections'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'

interface AddLevelsDialogProps {
  open: boolean
  onClose: () => void
  collection: CollectionDetail
  // When provided, results whose level ID is in this set are greyed out with
  // an "Already beaten" label. Used by the Want to Beat wrapper.
  completedIds?: Set<string>
}

// Holds a level resolved from RobTop for the seeded confirmation step.
interface SeededLevel {
  inGameId: string
  name: string | null
  creator: string | null
  inGameDifficulty: string | null
  featured: boolean | null
  epicValue: number | null
  isRated: boolean
  completed: boolean
}

export function AddLevelsDialog({
  open,
  onClose,
  collection,
  completedIds,
}: AddLevelsDialogProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [query, setQuery] = useState('')
  const [seeded, setSeeded] = useState<SeededLevel | null>(null)
  const [addAnother, setAddAnother] = useState(false)
  const [seedingId, setSeedingId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)

  const resolveLevel = useResolveLevel()
  const addEntry = useAddCollectionEntry()

  const trimmed = query.trim()
  const isNumeric = /^\d+$/.test(trimmed)
  const search = useLevelSearch(query)
  const cachedLevel = useLevelById(trimmed)

  const inCollection = new Set(collection.entries.map((e) => e.level.inGameId))
  const isWantToBeat = collection.type === 'WANT_TO_BEAT'

  useEffect(() => {
    if (open) {
      setQuery('')
      setSeeded(null)
      setAddAnother(false)
      setSeedingId(null)
      setAddingId(null)
    }
  }, [open])

  if (!open) return null

  // Direct add — for name-search results and known cached IDs where the user
  // can see exactly what they're clicking.
  async function handleDirectAdd(levelId: string, levelName: string | null) {
    setAddingId(levelId)
    try {
      await addEntry.mutateAsync({ collectionId: collection.id, levelId })
      toast.success(`Added ${levelName ?? 'level'} to ${collection.name}`)
      setQuery('')
      if (!addAnother) onClose()
    } catch (err) {
      const code = collectionErrorCode(err)
      toast.error(
        code === 'LEVEL_ALREADY_COMPLETED'
          ? 'Already completed — Want to Beat only holds unbeaten levels'
          : err instanceof ApiError
            ? err.message
            : 'Could not add that level'
      )
    } finally {
      setAddingId(null)
    }
  }

  // Seeded add — fetch an unknown ID from RobTop, then hold for confirmation.
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
      setSeeded({
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

  // Confirm add after seeding.
  async function handleSeededAdd() {
    if (!seeded || seeded.completed) return
    try {
      await addEntry.mutateAsync({
        collectionId: collection.id,
        levelId: seeded.inGameId,
      })
      toast.success(`Added ${seeded.name ?? 'level'} to ${collection.name}`)
      if (addAnother) {
        setSeeded(null)
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

  const seededAlreadyAdded = !!seeded && inCollection.has(seeded.inGameId)
  const seededBlocked = !!seeded && isWantToBeat && seeded.completed
  const canConfirm = !!seeded && !seededBlocked && !addEntry.isPending

  const showResults = !isNumeric && trimmed.length >= 2 && !seedingId && !seeded
  const showCachedPreview =
    isNumeric &&
    trimmed.length >= 4 &&
    !!cachedLevel.data &&
    !seedingId &&
    !seeded
  const showSeedHint =
    isNumeric &&
    trimmed.length >= 4 &&
    !cachedLevel.data &&
    !cachedLevel.isFetching &&
    !seedingId &&
    !seeded

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
                  if (cachedLevel.data)
                    void handleDirectAdd(
                      cachedLevel.data.inGameId,
                      cachedLevel.data.name
                    )
                  else void seedAndSelect(trimmed)
                }
              }}
              placeholder="Search by name or paste a level ID"
              className="h-12 pl-9 text-base"
            />
          </div>
        </div>

        {/* Fetching an unknown ID from RobTop. */}
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

        {/* Seeded confirmation card — only for unknown IDs fetched from RobTop. */}
        {seeded && !seedingId && (
          <div>
            <SectionLabel>Selected</SectionLabel>
            <div
              className={cn(
                'flex items-center gap-3 rounded-btn border px-4 py-3.5',
                seededBlocked || seededAlreadyAdded
                  ? 'border-border bg-bg-surface opacity-60'
                  : 'border-primary/50 bg-primary/10'
              )}
            >
              <DifficultyFace
                difficulty={seeded.inGameDifficulty}
                featured={seeded.featured}
                epicValue={seeded.epicValue}
                rated={seeded.isRated}
                size={72}
                className="drop-shadow"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-text-primary">
                  {seeded.name ?? `Level #${seeded.inGameId}`}
                </span>
                <span className="block truncate text-[13px] text-text-secondary">
                  {[
                    seeded.creator ? `by ${seeded.creator}` : null,
                    seeded.inGameDifficulty,
                    `#${seeded.inGameId}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {(seededBlocked || seededAlreadyAdded) && (
                <span className="shrink-0 rounded bg-bg-subtle px-2 py-1 text-[11px] font-medium text-text-tertiary">
                  {seededAlreadyAdded ? 'Added' : 'Already completed'}
                </span>
              )}
              <button
                type="button"
                onClick={() => setSeeded(null)}
                className="shrink-0 text-sm font-medium text-primary hover:underline"
              >
                Change
              </button>
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              {seededBlocked
                ? 'You already beat this level — Want to Beat only holds unbeaten levels.'
                : seededAlreadyAdded
                  ? `This level is already in ${collection.name}.`
                  : `This level will be added to ${collection.name}.`}
            </p>
          </div>
        )}

        {/* Cached preview for a typed numeric ID — direct add on click. */}
        {showCachedPreview && cachedLevel.data && (
          <div>
            <SectionLabel>Results</SectionLabel>
            <div className="overflow-hidden rounded-md border border-border">
              <ResultRow
                levelId={cachedLevel.data.inGameId}
                name={cachedLevel.data.name}
                creator={cachedLevel.data.creator}
                songName={cachedLevel.data.songName}
                inGameDifficulty={cachedLevel.data.inGameDifficulty}
                featured={cachedLevel.data.featured}
                epicValue={cachedLevel.data.epicValue}
                isRated={cachedLevel.data.isRated}
                added={inCollection.has(cachedLevel.data.inGameId)}
                beaten={completedIds?.has(cachedLevel.data.inGameId) ?? false}
                loading={addingId === cachedLevel.data.inGameId}
                disabled={addEntry.isPending}
                onSelect={() =>
                  void handleDirectAdd(
                    cachedLevel.data!.inGameId,
                    cachedLevel.data!.name
                  )
                }
              />
            </div>
          </div>
        )}

        {/* Unknown numeric ID — offer to seed from RobTop. */}
        {showSeedHint && (
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

        {/* Name search results — direct add on click. */}
        {showResults && (
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
                  Nothing in your cache matched. If you know the level ID, paste
                  it to pull it in.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                {(search.data ?? []).map((r) => (
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
                    added={inCollection.has(r.inGameId)}
                    beaten={completedIds?.has(r.inGameId) ?? false}
                    loading={addingId === r.inGameId}
                    disabled={addEntry.isPending}
                    onSelect={() => void handleDirectAdd(r.inGameId, r.name)}
                  />
                ))}
              </div>
            )}
            <p className="mt-2 px-1 text-xs text-text-tertiary">
              Paste a level ID to add one InfernoLog doesn&apos;t know yet —
              we&apos;ll fetch it from the GD servers.
            </p>
          </div>
        )}

        {/* Empty prompt. */}
        {!seeded &&
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
            onClick={() => void handleSeededAdd()}
            disabled={!canConfirm}
            className="min-w-[150px]"
          >
            {addEntry.isPending ? 'Adding…' : 'Add to collection'}
          </Button>
        )}
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

// Shared result row — matches the logging flow's FindLevelStep visual style.
// Thumbnail backdrop, gradient scrim, difficulty face, name/meta, ID on right.
// "Added" / "Already beaten" rows show a tag and are not clickable.
function ResultRow({
  levelId,
  name,
  creator,
  songName,
  inGameDifficulty,
  featured,
  epicValue,
  isRated,
  added,
  beaten = false,
  loading = false,
  disabled,
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
  added: boolean
  beaten?: boolean
  loading?: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const meta = [creator ? `by ${creator}` : null, songName]
    .filter(Boolean)
    .join(' · ')
  return (
    <button
      type="button"
      disabled={added || beaten || disabled}
      onClick={onSelect}
      className="group relative flex h-16 w-full items-center justify-between gap-3 overflow-hidden border-b border-border-subtle bg-bg-surface px-4 text-left transition-colors last:border-b-0 disabled:opacity-60"
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
      {loading ? (
        <Loader2
          size={16}
          className="relative animate-spin text-text-tertiary"
        />
      ) : added ? (
        <span className="relative rounded bg-bg-subtle px-2 py-1 text-[11px] font-medium text-text-tertiary">
          Added
        </span>
      ) : beaten ? (
        <span className="relative rounded bg-bg-subtle px-2 py-1 text-[11px] font-medium text-text-tertiary">
          Already beaten
        </span>
      ) : (
        <span className="relative font-mono text-xs text-text-secondary">
          #{levelId}
        </span>
      )}
    </button>
  )
}
