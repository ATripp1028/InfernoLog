import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/sonner'
import { ApiError } from '@/lib/api/client'
import {
  useLevelById,
  useLevelSearch,
  useResolveLevel,
  type Level,
  type LevelSearchResult,
} from '@/lib/api/logging'
import { useMyProgress } from '@/lib/api/list'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import { DifficultyFace } from '@/components/DifficultyFace'
import { useLoggingFlow } from '../LoggingFlowProvider'
import { FieldHint, FieldLabel, StepBody, StepFooter } from '../components'

export function FindLevelStep() {
  const { close, applyResolved, goManual } = useLoggingFlow()
  const [query, setQuery] = useState('')
  const resolveLevel = useResolveLevel()

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

  const showResults = !isNumeric && trimmed.length >= 2
  const showCachedPreview =
    isNumeric && trimmed.length >= 4 && !!cachedLevel.data
  const results = search.data ?? []

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
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isNumeric) void resolve(trimmed)
              }}
              placeholder="Enter a level ID, or type a name to search"
              className="h-11 pl-9 text-base"
            />
          </div>
          {!showResults && !showCachedPreview && (
            <FieldHint>
              Numbers only → looked up as an ID. Anything else → searched by
              name across levels InfernoLog already knows.
            </FieldHint>
          )}
        </div>

        {showCachedPreview && cachedLevel.data && (
          <div className="overflow-hidden rounded-md border border-border">
            <LevelResultRow
              level={cachedLevel.data}
              alreadyLogged={completedIds.has(cachedLevel.data.inGameId)}
              disabled={resolveLevel.isPending}
              onSelect={() => resolve(cachedLevel.data!.inGameId)}
            />
          </div>
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
                  <ResultRow
                    key={r.inGameId}
                    result={r}
                    alreadyLogged={completedIds.has(r.inGameId)}
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
          </div>
        )}
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button
          onClick={() => resolve(trimmed)}
          disabled={
            !isNumeric ||
            resolveLevel.isPending ||
            (showCachedPreview && completedIds.has(trimmed))
          }
        >
          {resolveLevel.isPending ? 'Looking up…' : 'Continue'}
        </Button>
      </StepFooter>
    </>
  )
}

// Variant of ResultRow for a full Level object (from the cached DB lookup).
function LevelResultRow({
  level,
  onSelect,
  alreadyLogged = false,
  disabled,
}: {
  level: Level
  onSelect: () => void
  alreadyLogged?: boolean
  disabled: boolean
}) {
  const meta = [level.creator ? `by ${level.creator}` : null, level.songName]
    .filter(Boolean)
    .join(' · ')
  return (
    <button
      type="button"
      disabled={alreadyLogged || disabled}
      onClick={onSelect}
      className="group relative flex h-16 w-full items-center justify-between gap-3 overflow-hidden border-b border-border-subtle bg-bg-surface px-4 text-left transition-colors last:border-b-0 disabled:opacity-60"
    >
      <img
        src={levelThumbnailUrl(level.inGameId)}
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
          difficulty={level.inGameDifficulty}
          featured={level.featured}
          epicValue={level.epicValue}
          rated={level.isRated}
          size={100}
          className="translate-y-[3px] drop-shadow"
        />
        <span>
          <span className="block font-medium leading-tight text-text-primary">
            {level.name ?? `Level #${level.inGameId}`}
          </span>
          {meta && (
            <span className="block text-xs text-text-secondary">{meta}</span>
          )}
        </span>
      </span>
      {alreadyLogged ? (
        <span className="relative rounded bg-bg-subtle px-2 py-1 text-[11px] font-medium text-text-tertiary">
          Already logged
        </span>
      ) : (
        <span className="relative font-mono text-xs text-text-secondary">
          #{level.inGameId}
        </span>
      )}
    </button>
  )
}

function ResultRow({
  result,
  onSelect,
  alreadyLogged = false,
  disabled,
}: {
  result: LevelSearchResult
  onSelect: () => void
  alreadyLogged?: boolean
  disabled: boolean
}) {
  const meta = [result.creator ? `by ${result.creator}` : null, result.songName]
    .filter(Boolean)
    .join(' · ')
  return (
    <button
      type="button"
      disabled={alreadyLogged || disabled}
      onClick={onSelect}
      className="group relative flex h-16 w-full items-center justify-between gap-3 overflow-hidden border-b border-border-subtle bg-bg-surface px-4 text-left transition-colors last:border-b-0 disabled:opacity-60"
    >
      {/* Level thumbnail backdrop; hidden if it fails to load. */}
      <img
        src={levelThumbnailUrl(result.inGameId)}
        alt=""
        aria-hidden
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
        className="absolute inset-0 size-full object-cover"
      />
      {/* Scrim for legibility + a subtle hover lift. */}
      <span className="absolute inset-0 bg-gradient-to-r from-bg-base/95 via-bg-base/85 to-bg-base/55" />
      <span className="absolute inset-0 bg-white/0 transition-colors group-hover:bg-white/5" />

      <span className="relative flex items-center gap-3">
        <DifficultyFace
          difficulty={result.inGameDifficulty}
          featured={result.featured}
          epicValue={result.epicValue}
          rated={result.isRated}
          size={100}
          className="translate-y-[3px] drop-shadow"
        />
        <span>
          <span className="block font-medium leading-tight text-text-primary">
            {result.name ?? `Level #${result.inGameId}`}
          </span>
          {meta && (
            <span className="block text-xs text-text-secondary">{meta}</span>
          )}
        </span>
      </span>
      {alreadyLogged ? (
        <span className="relative rounded bg-bg-subtle px-2 py-1 text-[11px] font-medium text-text-tertiary">
          Already logged
        </span>
      ) : (
        <span className="relative font-mono text-xs text-text-secondary">
          #{result.inGameId}
        </span>
      )}
    </button>
  )
}
