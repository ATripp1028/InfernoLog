import { DifficultyFace } from '@/components/data/DifficultyFace'
import { Chip } from '@/components/generic/chip'
import { Segmented } from '@/components/generic/segmented'
import { RangeRow } from '@/components/inputs/RangeRow'
import { cn } from '@/lib/utils'
import {
  DIFFICULTY_FACE,
  DIFFICULTY_OPTIONS,
  LENGTH_OPTIONS,
  LEVEL_TYPE_OPTIONS,
  RATE_STATUS_FACE,
  RATE_STATUS_OPTIONS,
  SONG_TYPE_OPTIONS,
  type LevelType,
  type LevelSongType,
  type SearchPageState,
} from '@/lib/levelSearchParams'
import { BoundInputs } from './BoundInputs'
import { TRISTATE, fromTri, toggle, triValue } from './filterControls'
import {
  COMMUNITY_RANGE_FILTERS,
  STAT_RANGE_FILTERS,
  boundsPatch,
  boundsValue,
  rangePatch,
  rangeValue,
  type RangeFilterConfig,
} from './rangeFilters'
import { SheetTierSelect } from './SheetTierSelect'

interface SearchFiltersProps {
  state: SearchPageState
  onChange: (patch: Partial<SearchPageState>) => void
  onReset: () => void
  hasFilters: boolean
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
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      {children}
    </div>
  )
}

// A titled block of filters under a divider, laid out as a grid.
function FilterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4 border-t border-border-subtle pt-5">
      <p className="text-xs font-medium text-text-secondary">{title}</p>
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </div>
  )
}

// One range filter, as a slider or as a pair of boxes depending on the field.
function RangeFilter({
  cfg,
  state,
  onChange,
}: {
  cfg: RangeFilterConfig
  state: SearchPageState
  onChange: (patch: Partial<SearchPageState>) => void
}) {
  return (
    <FilterGroup label={cfg.label}>
      {cfg.kind === 'slider' ? (
        <RangeRow
          label={cfg.label}
          hideLabel
          className="px-0 py-0"
          min={cfg.domain[0]}
          max={cfg.domain[1]}
          step={cfg.step}
          commitOnRelease
          value={rangeValue(state, cfg)}
          onChange={(v) => onChange(rangePatch(cfg, v))}
          format={cfg.format}
          trackClassName={cfg.trackClassName}
          trackStyle={cfg.trackStyle}
        />
      ) : (
        <BoundInputs
          cfg={cfg}
          value={boundsValue(state, cfg.field)}
          onChange={(b) => onChange(boundsPatch(cfg.field, b))}
        />
      )}
    </FilterGroup>
  )
}

/**
 * The /search filter panel, rendered inline under the search bar. Every change
 * navigates (via onChange → replace) so the URL stays the source of truth for
 * the grid; the range sliders commit on release and the boxes on blur/Enter,
 * so an edit is one query rather than one per step or keystroke.
 */
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

      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
        <FilterGroup label="Difficulty" className="md:col-span-2">
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
                levelType: v === 'any' ? undefined : (v as LevelType),
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

      <FilterSection title="Community lists">
        {COMMUNITY_RANGE_FILTERS.map((cfg) => (
          <RangeFilter
            key={cfg.field}
            cfg={cfg}
            state={state}
            onChange={onChange}
          />
        ))}
        <FilterGroup label="Sheet tier">
          <SheetTierSelect
            value={state.sheetTier}
            onChange={(sheetTier) => onChange({ sheetTier })}
          />
        </FilterGroup>
      </FilterSection>

      <FilterSection title="Level stats">
        {STAT_RANGE_FILTERS.map((cfg) => (
          <RangeFilter
            key={cfg.field}
            cfg={cfg}
            state={state}
            onChange={onChange}
          />
        ))}
      </FilterSection>
    </div>
  )
}
