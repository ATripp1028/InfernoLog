import { DifficultyFace } from '@/components/DifficultyFace'
import { Chip } from '@/components/ui/chip'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'
import {
  DIFFICULTY_FACE,
  DIFFICULTY_OPTIONS,
  LENGTH_OPTIONS,
  LEVEL_TYPE_OPTIONS,
  RATE_STATUS_FACE,
  RATE_STATUS_OPTIONS,
  SONG_TYPE_OPTIONS,
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

// A difficulty/rate-status face rendered as a toggle button.
function FaceToggle({
  selected,
  label,
  onClick,
  difficulty,
  featured,
  epicValue,
}: {
  selected: boolean
  label: string
  onClick: () => void
  difficulty: string
  featured?: boolean | undefined
  epicValue?: number | undefined
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center rounded-full p-1.5 transition-colors',
        selected
          ? 'bg-primary-dim ring-2 ring-primary'
          : 'hover:bg-white/[0.08]'
      )}
    >
      <DifficultyFace
        difficulty={difficulty}
        featured={featured ?? null}
        epicValue={epicValue ?? null}
        size={40}
      />
    </button>
  )
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

// The /search filter panel (rendered inside a popover). Every change navigates
// (via onChange → replace) so the URL stays the source of truth for the grid.
export function SearchFilters({
  state,
  onChange,
  onReset,
  hasFilters,
}: SearchFiltersProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">Filters</p>
        {hasFilters && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            Clear all
          </button>
        )}
      </div>

      <FilterGroup label="Difficulty">
        <div className="flex flex-wrap gap-1">
          {DIFFICULTY_OPTIONS.map((o) => (
            <FaceToggle
              key={o.value}
              label={o.label}
              difficulty={DIFFICULTY_FACE[o.value].difficulty}
              selected={state.difficulty?.includes(o.value) ?? false}
              onClick={() =>
                onChange({ difficulty: toggle(state.difficulty, o.value) })
              }
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="Rate status">
        <div className="flex flex-wrap gap-1">
          {RATE_STATUS_OPTIONS.map((o) => {
            const face = RATE_STATUS_FACE[o.value]
            return (
              <FaceToggle
                key={o.value}
                label={o.label}
                difficulty={face.difficulty}
                featured={face.featured}
                epicValue={face.epicValue}
                selected={state.rateStatus?.includes(o.value) ?? false}
                onClick={() =>
                  onChange({ rateStatus: toggle(state.rateStatus, o.value) })
                }
              />
            )
          })}
        </div>
      </FilterGroup>

      <FilterGroup label="Length">
        <div className="flex flex-wrap gap-1.5">
          {LENGTH_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              selected={state.length?.includes(o.value) ?? false}
              onClick={() =>
                onChange({ length: toggle(state.length, o.value) })
              }
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </FilterGroup>

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
  )
}
