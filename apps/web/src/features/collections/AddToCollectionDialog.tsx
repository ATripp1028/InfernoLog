// Two-step flow for adding a level to one or more collections.
//
//   Step 1 (level search) — skipped when preselectedLevel is provided.
//     Name search / cached ID → click to proceed to step 2.
//     Unknown numeric ID → seed from RobTop → proceed to step 2.
//
//   Step 2 (collection picker) — searchable list with checkboxes.
//     Confirm adds the level to all selected collections in parallel.

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Loader2, Search, X } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DifficultyFace } from '@/components/DifficultyFace'
import { ApiError } from '@/lib/api/client'
import {
  useLevelById,
  useLevelSearch,
  useResolveLevel,
} from '@/lib/api/logging'
import {
  collectionErrorCode,
  useAddCollectionEntry,
  useCollectionDetails,
  useCollections,
} from '@/lib/api/collections'
import { collectionIdentity, isBuiltIn, withAlpha } from './identity'
import { useMyProgress } from '@/lib/api/list'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import { sortAndCapSearchResults } from '@/lib/levelSearchResults'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { GdSearchSection } from '@/features/search/GdSearchSection'
import { useEscalation } from '@/features/search/useEscalation'
import { SeededLevelPreviewCard, SectionLabel } from './SeededLevelPreviewCard'

interface PickedLevel {
  inGameId: string
  name: string | null
  creator: string | null
  inGameDifficulty: string | null
  featured: boolean | null
  epicValue: number | null
  isRated: boolean
}

// Holds a level resolved from RobTop, pending confirmation before it's used
// as the pick for step 2. Mirrors AddLevelsDialog's seeded-confirmation step.
interface SeededLevel extends PickedLevel {
  completed: boolean
}

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

  const [step, setStep] = useState<'search' | 'pick'>(
    preselectedLevel ? 'pick' : 'search'
  )
  const [pickedLevel, setPickedLevel] = useState<PickedLevel | null>(
    preselectedLevel ?? null
  )
  const [levelQuery, setLevelQuery] = useState('')
  const [collectionQuery, setCollectionQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [seedingId, setSeedingId] = useState<string | null>(null)
  const [seededLevel, setSeededLevel] = useState<SeededLevel | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resolveLevel = useResolveLevel()
  const addEntry = useAddCollectionEntry()
  const collections = useCollections()
  const list = useMyProgress()
  const escalation = useEscalation()

  const completedIds = useMemo(
    () =>
      new Set(
        list.data
          ?.filter((i) => i.status === 'COMPLETED')
          .map((i) => i.level.inGameId) ?? []
      ),
    [list.data]
  )

  const trimmed = levelQuery.trim()
  const isNumeric = /^\d+$/.test(trimmed)
  const search = useLevelSearch(levelQuery)
  const cachedLevel = useLevelById(trimmed)

  useEffect(() => {
    if (open) {
      setStep(preselectedLevel ? 'pick' : 'search')
      setPickedLevel(preselectedLevel ?? null)
      setLevelQuery('')
      setCollectionQuery('')
      setSelectedIds(new Set())
      setSeedingId(null)
      setSeededLevel(null)
      setIsSubmitting(false)
      escalation.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselectedLevel])

  // Editing the query drops any prior GD escalation (fresh confirm required).
  function updateLevelQuery(value: string) {
    setLevelQuery(value)
    escalation.clear()
  }

  // Batch-load collection details only once the user reaches the pick step.
  const collectionIds = useMemo(
    () => (collections.data ?? []).map((c) => c.id),
    [collections.data]
  )
  const collectionDetailQueries = useCollectionDetails(
    collectionIds,
    step === 'pick'
  )

  // Set of collection IDs that already contain the picked level (from loaded details).
  const levelAlreadyInCollectionIds = useMemo(() => {
    const result = new Set<string>()
    if (!pickedLevel) return result
    collectionIds.forEach((id, i) => {
      const q = collectionDetailQueries[i]
      if (
        q?.data?.entries.some((e) => e.level.inGameId === pickedLevel.inGameId)
      ) {
        result.add(id)
      }
    })
    return result
  }, [collectionIds, collectionDetailQueries, pickedLevel])

  // Auto-uncheck any selection that is discovered to already have the level.
  useEffect(() => {
    if (levelAlreadyInCollectionIds.size === 0) return
    setSelectedIds((prev) => {
      const toRemove = [...prev].filter((id) =>
        levelAlreadyInCollectionIds.has(id)
      )
      if (toRemove.length === 0) return prev
      const next = new Set(prev)
      toRemove.forEach((id) => next.delete(id))
      return next
    })
  }, [levelAlreadyInCollectionIds])

  if (!open) return null

  function selectLevel(level: PickedLevel) {
    setPickedLevel(level)
    setCollectionQuery('')
    setSelectedIds(new Set())
    setStep('pick')
  }

  async function seedAndPick(levelId: string) {
    setSeedingId(levelId)
    try {
      const res = await resolveLevel.mutateAsync(levelId)
      if (!res.level) {
        toast.error(
          'That level could not be fetched from the GD servers. Log it once to add it manually.'
        )
        return
      }
      setSeededLevel({
        inGameId: res.level.inGameId,
        name: res.level.name,
        creator: res.level.creator,
        inGameDifficulty: res.level.inGameDifficulty,
        featured: res.level.featured,
        epicValue: res.level.epicValue,
        isRated: res.level.isRated,
        completed: res.existingCompletion !== null,
      })
      setLevelQuery('')
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not look up that level'
      )
    } finally {
      setSeedingId(null)
    }
  }

  async function handleAdd() {
    if (!pickedLevel || selectedIds.size === 0 || isSubmitting) return
    setIsSubmitting(true)
    const idList = [...selectedIds]
    try {
      const results = await Promise.allSettled(
        idList.map((collectionId) =>
          addEntry.mutateAsync({ collectionId, levelId: pickedLevel.inGameId })
        )
      )
      const successNames: string[] = []
      results.forEach((r, i) => {
        const id = idList[i]!
        const colName =
          collections.data?.find((c) => c.id === id)?.name ?? 'collection'
        if (r.status === 'fulfilled') {
          successNames.push(colName)
        } else {
          const code = collectionErrorCode(r.reason)
          toast.error(
            code === 'LEVEL_ALREADY_COMPLETED'
              ? `${colName}: Want to Beat only holds unbeaten levels`
              : r.reason instanceof ApiError
                ? r.reason.message
                : `Could not add to ${colName}`
          )
        }
      })
      if (successNames.length > 0) {
        toast.success(`Added to ${successNames.join(', ')}`)
        onClose()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Step 1: level search ───────────────────────────────────────────

  const showResults =
    !isNumeric && trimmed.length >= 2 && !seedingId && !seededLevel
  const showCachedPreview =
    isNumeric &&
    trimmed.length >= 4 &&
    !!cachedLevel.data &&
    !seedingId &&
    !seededLevel
  const showSeedHint =
    isNumeric &&
    trimmed.length >= 4 &&
    !cachedLevel.data &&
    !cachedLevel.isFetching &&
    !seedingId &&
    !seededLevel

  const results = sortAndCapSearchResults(search.data ?? [], () => false)

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
              if (e.key === 'Enter' && isNumeric) {
                if (cachedLevel.data) selectLevel(cachedLevel.data)
                else void seedAndPick(trimmed)
              }
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
          onChange={() => setSeededLevel(null)}
          description={
            seededLevel.completed
              ? "You already completed this level — Want to Beat won't be offered as an option next."
              : 'Continue to choose which collections to add it to.'
          }
        />
      )}

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
              onSelect={() => selectLevel(cachedLevel.data!)}
            />
          </div>
        </div>
      )}

      {showSeedHint && (
        <div>
          <SectionLabel>Results</SectionLabel>
          <button
            type="button"
            onClick={() => void seedAndPick(trimmed)}
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
          {search.isPending ? (
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

          {!search.isPending && (
            <div className="mt-3 overflow-hidden rounded-md border border-border">
              <GdSearchSection
                escalation={escalation}
                query={trimmed}
                onSelect={(levelId) => void seedAndPick(levelId)}
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

      {!showResults &&
        !showCachedPreview &&
        !showSeedHint &&
        !seedingId &&
        !seededLevel && (
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

  const pickedIsCompleted =
    !!pickedLevel && completedIds.has(pickedLevel.inGameId)
  const allCollections = (collections.data ?? []).filter(
    (c) => !(pickedIsCompleted && c.type === 'WANT_TO_BEAT')
  )
  const filteredCollections = collectionQuery.trim()
    ? allCollections.filter((c) =>
        c.name.toLowerCase().includes(collectionQuery.toLowerCase())
      )
    : allCollections

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
        {collections.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-text-tertiary" />
          </div>
        ) : collections.isError ||
          !collections.data?.some((c) => isBuiltIn(c.type)) ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <p className="text-sm font-medium text-text-primary">
              {collections.isError
                ? "Couldn't load your collections"
                : 'Collections not set up yet'}
            </p>
            <p className="mt-1.5 text-[13px] text-text-tertiary">
              {collections.isError
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
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(c.id)
                          else next.delete(c.id)
                          return next
                        })
                      }}
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

  const canGoBack = step === 'pick' && !preselectedLevel
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
            onClick={() => setStep('search')}
            className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={14} />
            Change level
          </button>
        ) : (
          <span />
        )}
        <Button
          onClick={() => void handleAdd()}
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
