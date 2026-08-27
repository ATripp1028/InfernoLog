import { useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import { toast } from '@/components/generic/sonner'
import { ApiError } from '@/lib/api/client'
import {
  useLevelById,
  useLevelSearch,
  useResolveLevel,
} from '@/lib/api/logging'
import { useMyProgress } from '@/lib/api/log'
import { sortAndCapSearchResults } from '@/lib/levelSearchResults'
import { LevelResultRow } from '@/components/data/LevelResultRow'
import { GdSearchSection } from '@/features/search/GdSearchSection'
import { useEscalation } from '@/features/search/useEscalation'
import { useLoggingFlow } from '../LoggingFlowProvider'
import type { ResolvedLevel } from '../types'
import { FieldHint, FieldLabel, StepBody, StepFooter } from '../components'

/**
 * The entry step: find a level by name or id, with the option to escalate to a GD-server search.
 */
export function FindLevelStep() {
  const { close, applyResolved, goManual } = useLoggingFlow()
  const [query, setQuery] = useState('')
  const [seedingId, setSeedingId] = useState<string | null>(null)
  const [seeded, setSeeded] = useState<ResolvedLevel | null>(null)
  const resolveLevel = useResolveLevel()
  const escalation = useEscalation()

  const trimmed = query.trim()
  const isNumeric = /^\d+$/.test(trimmed)
  const search = useLevelSearch(query)
  const cachedLevel = useLevelById(trimmed)

  // Multiple completions per level are out of scope for v1 — grey out levels
  // the user has already logged a completion for, same pattern as the
  // "already beaten" state in AddLevelsDialog's collection picker.
  const myProgress = useMyProgress()
  const completedIds = useMemo(
    () =>
      new Set(
        myProgress.data
          ?.filter((i) => i.status === 'COMPLETED')
          .map((i) => i.level.inGameId) ?? []
      ),
    [myProgress.data]
  )

  // Direct apply — for cached-preview / search-result rows, where the user
  // can already see exactly what they're clicking.
  async function resolve(levelId: string) {
    try {
      const res = await resolveLevel.mutateAsync(levelId)
      if (res.fallbackToManual) {
        goManual(levelId, res.existingCompletion)
        return
      }
      if (res.level) {
        applyResolved({
          level: res.level,
          existingCompletion: res.existingCompletion,
          suggestedGddlTier: res.suggestedGddlTier,
        })
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not look up that level'
      )
    }
  }

  // Seeded fetch — for unknown numeric IDs pulled live from RobTop. Holds for
  // confirmation instead of applying immediately, since the user typed a raw
  // ID with no name visible. Confirming re-uses the same row UI as a cached
  // preview — clicking it applies, same as any other result row.
  async function seedLevel(levelId: string) {
    setSeedingId(levelId)
    try {
      const res = await resolveLevel.mutateAsync(levelId)
      if (res.fallbackToManual) {
        goManual(levelId, res.existingCompletion)
        return
      }
      if (res.level) {
        setSeeded({
          level: res.level,
          existingCompletion: res.existingCompletion,
          suggestedGddlTier: res.suggestedGddlTier,
        })
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not look up that level'
      )
    } finally {
      setSeedingId(null)
    }
  }

  function updateQuery(value: string) {
    setQuery(value)
    if (seeded) setSeeded(null)
    // Editing the query drops any prior GD escalation (fresh confirm required).
    escalation.clear()
  }

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
  const results = sortAndCapSearchResults(search.data ?? [], (r) =>
    completedIds.has(r.inGameId)
  )
  // The row whose resolve is in flight. The mutation carries the level id it
  // was called with, so the clicked row is identifiable without a second piece
  // of state — every path through this step resolves one level at a time.
  const resolvingId = resolveLevel.isPending
    ? (resolveLevel.variables ?? null)
    : null

  return (
    <>
      <StepBody>
        <div>
          <FieldLabel htmlFor="level-query">Level ID or name</FieldLabel>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <Input
              id="level-query"
              autoFocus
              value={query}
              onChange={(e) => updateQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !isNumeric) return
                if (cachedLevel.data) void resolve(cachedLevel.data.inGameId)
                else void seedLevel(trimmed)
              }}
              placeholder="Enter a level ID, or type a name to search"
              className="h-11 pl-9 text-base"
            />
          </div>
          {!showResults && !showCachedPreview && !seeded && (
            <FieldHint>
              Numbers only → looked up as an ID. Anything else → searched by
              name across levels InfernoLog already knows.
            </FieldHint>
          )}
        </div>

        {seedingId && (
          <div className="flex h-16 items-center gap-3 rounded-md border border-border bg-bg-surface px-4 text-sm text-text-secondary">
            <Loader2 size={16} className="animate-spin text-primary" />
            Fetching level {seedingId} from the GD servers…
          </div>
        )}

        {seeded && !seedingId && (
          <div className="overflow-hidden rounded-md border border-border">
            <LevelResultRow
              level={seeded.level}
              badge={
                completedIds.has(seeded.level.inGameId)
                  ? 'Already logged'
                  : null
              }
              disabled={resolveLevel.isPending}
              onSelect={() => applyResolved(seeded)}
            />
          </div>
        )}

        {showCachedPreview && cachedLevel.data && (
          <div className="overflow-hidden rounded-md border border-border">
            <LevelResultRow
              level={cachedLevel.data}
              badge={
                completedIds.has(cachedLevel.data.inGameId)
                  ? 'Already logged'
                  : null
              }
              loading={resolvingId === cachedLevel.data.inGameId}
              disabled={resolveLevel.isPending}
              onSelect={() => resolve(cachedLevel.data!.inGameId)}
            />
          </div>
        )}

        {showSeedHint && (
          <button
            type="button"
            onClick={() => void seedLevel(trimmed)}
            className="flex h-11 w-full items-center gap-3 rounded-md border border-border bg-bg-surface px-4 text-left text-sm text-text-primary transition-colors hover:bg-bg-subtle"
          >
            <Search size={16} className="text-text-tertiary" />
            Fetch level {trimmed} from the GD servers
          </button>
        )}

        {showResults && (
          <div className="space-y-2">
            {search.isPending ? (
              <p className="px-1 text-sm text-text-tertiary">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-1 text-sm text-text-tertiary">
                No matches yet. Paste the level ID of the official version (not
                a startpos copy) to add it.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                {results.map((r) => (
                  <LevelResultRow
                    key={r.inGameId}
                    level={r}
                    badge={
                      completedIds.has(r.inGameId) ? 'Already logged' : null
                    }
                    loading={resolvingId === r.inGameId}
                    disabled={resolveLevel.isPending}
                    onSelect={() => resolve(r.inGameId)}
                  />
                ))}
              </div>
            )}
            <p className="px-1 text-xs text-text-tertiary">
              Showing levels InfernoLog already knows. Can&apos;t find it? Paste
              the level ID of the official version (not a startpos copy) to add
              it.
            </p>

            {!search.isPending && (
              <div className="overflow-hidden rounded-md border border-border">
                <GdSearchSection
                  escalation={escalation}
                  query={trimmed}
                  onSelect={(levelId) => void resolve(levelId)}
                  loadingId={resolvingId}
                  offer={{
                    title: `Search GD's servers for "${trimmed}"`,
                    subtitle:
                      'One request to RobTop. Rated levels are added automatically; unrated only if you pick one.',
                  }}
                />
              </div>
            )}
          </div>
        )}
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
      </StepFooter>
    </>
  )
}
