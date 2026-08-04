import { Chip } from '@/components/ui/chip'
import { Segmented } from '@/components/ui/segmented'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DIFFICULTY_OPTIONS,
  LENGTH_OPTIONS,
  LEVEL_TYPE_OPTIONS,
  RATE_STATUS_OPTIONS,
  SONG_TYPE_OPTIONS,
  SORT_OPTIONS,
  type LevelSort,
  type LevelTypeFilter,
  type LevelSongType,
  type SearchPageState,
} from '@/lib/levelSearchParams'

interface SearchFiltersProps {
  state: SearchPageState
  onChange: (patch: Partial<SearchPageState>) => void
  onReset: () => void
  hasFilters: boolean
}

// Toggles membership of `v` in a filter array, collapsing an emptied array back
// to undefined so the URL/query stays clean.
function toggle<T>(arr: T[] | undefined, v: T): T[] | undefined {
  const set = new Set(arr ?? [])
  if (set.has(v)) set.delete(v)
  else set.add(v)
  const out = [...set]
  return out.length ? out : undefined
}

// Maps a nullable-boolean filter onto a three-way segmented control.
const TRISTATE = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const
function triValue(b: boolean | undefined): 'any' | 'yes' | 'no' {
  return b === undefined ? 'any' : b ? 'yes' : 'no'
}
function fromTri(v: 'any' | 'yes' | 'no'): boolean | undefined {
  return v === 'any' ? undefined : v === 'yes'
}

function FilterGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      {children}
    </div>
  )
}

// The /search filter + sort panel. Every change navigates (via onChange →
// replace) so the URL stays the source of truth for the results grid.
export function SearchFilters({
  state,
  onChange,
  onReset,
  hasFilters,
}: SearchFiltersProps) {
  return (
    <div className="space-y-5 rounded-card border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
            Sort by
          </span>
          <div className="w-[168px]">
            <Select
              value={state.sort}
              onValueChange={(v) => onChange({ sort: v as LevelSort })}
            >
              <SelectTrigger className="h-9" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            Clear filters
          </button>
        )}
      </div>

      <FilterGroup label="Difficulty">
        <div className="flex flex-wrap gap-1.5">
          {DIFFICULTY_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              selected={state.difficulty?.includes(o.value) ?? false}
              onClick={() =>
                onChange({ difficulty: toggle(state.difficulty, o.value) })
              }
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Rate status">
        <div className="flex flex-wrap gap-1.5">
          {RATE_STATUS_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              selected={state.rateStatus?.includes(o.value) ?? false}
              onClick={() =>
                onChange({ rateStatus: toggle(state.rateStatus, o.value) })
              }
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Length">
        <div className="flex flex-wrap gap-1.5">
          {LENGTH_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              selected={state.length?.includes(o.value) ?? false}
              onClick={() => onChange({ length: toggle(state.length, o.value) })}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </FilterGroup>

      <div className="grid gap-5 sm:grid-cols-2">
        <FilterGroup label="Coins">
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2, 3].map((n) => (
              <Chip
                key={n}
                selected={state.coinCount?.includes(n) ?? false}
                onClick={() =>
                  onChange({ coinCount: toggle(state.coinCount, n) })
                }
              >
                {n} {n === 1 ? 'coin' : 'coins'}
              </Chip>
            ))}
          </div>
          <div className="mt-2">
            <Segmented
              options={[
                { value: 'any', label: 'Any' },
                { value: 'yes', label: 'Verified' },
                { value: 'no', label: 'Unverified' },
              ]}
              value={triValue(state.coinsVerified)}
              onChange={(v) => onChange({ coinsVerified: fromTri(v) })}
            />
          </div>
        </FilterGroup>

        <FilterGroup label="Two player">
          <Segmented
            options={TRISTATE}
            value={triValue(state.twoPlayer)}
            onChange={(v) => onChange({ twoPlayer: fromTri(v) })}
          />
        </FilterGroup>

        <FilterGroup label="Level type">
          <Segmented
            options={[{ value: 'any', label: 'Any' }, ...LEVEL_TYPE_OPTIONS]}
            value={state.levelType ?? 'any'}
            onChange={(v) =>
              onChange({
                levelType: v === 'any' ? undefined : (v as LevelTypeFilter),
              })
            }
          />
        </FilterGroup>

        <FilterGroup label="Song">
          <Segmented
            options={[{ value: 'any', label: 'Any' }, ...SONG_TYPE_OPTIONS]}
            value={state.songType ?? 'any'}
            onChange={(v) =>
              onChange({
                songType: v === 'any' ? undefined : (v as LevelSongType),
              })
            }
          />
        </FilterGroup>
      </div>
    </div>
  )
}
