import { X } from 'lucide-react'
import type {
  DateFormatPreference,
  RatingCategory,
  RatingDisplayScale,
} from '@/lib/api/me'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { difficultyFaceSrc } from '@/lib/gdAssets'
import { formatRating, formatNumber } from '@/features/logging/format'
import { FilterSection } from './FilterSection'
import { gddlTrackGradient } from './tierColor'
import { RangeRow, DatePickersRow } from './FilterInputs'
import {
  DEVICES,
  FLAGS,
  LEVEL_FLAGS,
  LEVEL_TYPES,
  PROGRESS,
  RATED_STATUSES,
  toggle,
  useFilterPanel,
} from './useFilterPanel'
import {
  ATTEMPTS_DOMAIN,
  RATING_DOMAIN,
  TIER_DOMAIN,
  type FilterState,
} from './types'

interface FilterPanelProps {
  filters: FilterState
  onChange: (next: FilterState) => void
  matchCount: number
  totalCount: number
  scale: RatingDisplayScale
  dateFormatPreference: DateFormatPreference
  // Distinct values present in the data, for the chip filters.
  availableLengths: string[]
  availableGameVersions: string[]
  availableDifficulties: string[]
  // Data-driven slider bounds.
  earliestDate: number
  maxAttempts: number
  // Rating categories for per-category range filters (WEIGHTED mode only).
  ratingCategories?: RatingCategory[]
  onClose?: () => void
}

export function FilterPanel({
  filters,
  onChange,
  matchCount,
  totalCount,
  scale,
  dateFormatPreference,
  availableLengths,
  availableGameVersions,
  availableDifficulties,
  earliestDate,
  maxAttempts,
  ratingCategories,
  onClose,
}: FilterPanelProps) {
  const {
    set,
    setCategoryRating,
    clearAll,
    hasActiveFilters,
    displayScaleMax,
    parseRating,
    parseTier,
    parseAttempts,
    today,
  } = useFilterPanel({ filters, onChange, scale, maxAttempts })

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-surface)]">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-3">
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearAll}
            className="rounded px-2 py-1 text-[13px] font-medium text-primary cursor-pointer"
          >
            Clear all
          </button>
        ) : (
          <span className="w-12" />
        )}
        <p className="text-[15px] font-semibold text-text-primary">Filters</p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="rounded px-2 py-1 text-text-secondary cursor-pointer"
          >
            <X size={16} />
          </button>
        ) : (
          <span className="w-12" />
        )}
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FilterSection title="Progress">
          <div className="flex flex-wrap gap-1.5 px-4">
            {PROGRESS.map((p) => (
              <Chip
                key={p.value}
                className="cursor-pointer"
                selected={filters.statuses.includes(p.value)}
                onClick={() =>
                  set({ statuses: toggle(filters.statuses, p.value) })
                }
              >
                {p.label}
              </Chip>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Rating">
          <RangeRow
            label="Rating"
            min={RATING_DOMAIN[0]}
            max={RATING_DOMAIN[1]}
            step={1}
            value={filters.rating}
            onChange={(rating) => set({ rating })}
            format={(v) => formatRating(v, scale)}
            parseInput={parseRating}
          />
          <RangeRow
            label="Enjoyment"
            min={RATING_DOMAIN[0]}
            max={RATING_DOMAIN[1]}
            step={1}
            value={filters.enjoyment}
            onChange={(enjoyment) => set({ enjoyment })}
            format={(v) => formatRating(v, scale)}
            parseInput={parseRating}
          />
          {ratingCategories &&
            [...ratingCategories]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((cat) => (
                <RangeRow
                  key={cat.id}
                  label={cat.name}
                  min={RATING_DOMAIN[0]}
                  max={RATING_DOMAIN[1]}
                  step={1}
                  value={
                    (filters.categoryRatings ?? {})[cat.id] ?? RATING_DOMAIN
                  }
                  onChange={(range) => setCategoryRating(cat.id, range)}
                  format={(v) => formatRating(v, scale)}
                  parseInput={parseRating}
                />
              ))}
          <p className="px-4 pt-1 text-[10px] text-text-tertiary">
            Scale 0–{displayScaleMax}
          </p>
        </FilterSection>

        <FilterSection title="GDDL Tier">
          <RangeRow
            label="Tier range"
            min={TIER_DOMAIN[0]}
            max={TIER_DOMAIN[1]}
            step={1}
            value={filters.tier}
            onChange={(tier) => set({ tier })}
            format={(v) => (v >= TIER_DOMAIN[1] ? '35+' : String(v))}
            parseInput={parseTier}
            trackClassName="bg-transparent"
            trackStyle={{
              backgroundImage: gddlTrackGradient(
                TIER_DOMAIN[0],
                TIER_DOMAIN[1]
              ),
            }}
          />
        </FilterSection>

        <FilterSection title="Date Beaten">
          <DatePickersRow
            value={filters.dateBeaten}
            onChange={(dateBeaten) => set({ dateBeaten })}
            datePref={dateFormatPreference}
            minDate={earliestDate}
            today={today}
          />
        </FilterSection>

        <FilterSection title="Attempts">
          <RangeRow
            label="Attempt range"
            min={ATTEMPTS_DOMAIN[0]}
            max={maxAttempts}
            step={100}
            value={filters.attempts}
            onChange={(attempts) => set({ attempts })}
            format={(v) => formatNumber(v)}
            parseInput={parseAttempts}
          />
        </FilterSection>

        <FilterSection title="Level Type">
          <div className="flex flex-wrap gap-1.5 px-4">
            {LEVEL_TYPES.map((t) => (
              <Chip
                key={t.value}
                className="cursor-pointer"
                selected={filters.levelTypes.includes(t.value)}
                onClick={() =>
                  set({ levelTypes: toggle(filters.levelTypes, t.value) })
                }
              >
                {t.label}
              </Chip>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Device">
          <div className="flex flex-wrap gap-1.5 px-4">
            {DEVICES.map((d) => (
              <Chip
                key={d.value}
                className="cursor-pointer"
                selected={filters.devices.includes(d.value)}
                onClick={() =>
                  set({ devices: toggle(filters.devices, d.value) })
                }
              >
                {d.label}
              </Chip>
            ))}
          </div>
        </FilterSection>

        {availableDifficulties.length > 0 && (
          <FilterSection title="Difficulty">
            <div className="grid grid-cols-5 gap-1 px-4">
              {availableDifficulties.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={filters.difficulties.includes(d)}
                  onClick={() =>
                    set({ difficulties: toggle(filters.difficulties, d) })
                  }
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-md p-1 cursor-pointer transition-colors',
                    filters.difficulties.includes(d)
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-text-secondary hover:text-text-primary'
                  )}
                >
                  <img
                    src={difficultyFaceSrc(d)}
                    alt={d}
                    className="h-7 w-7 object-contain"
                    draggable={false}
                  />
                  <span className="text-center text-[8px] leading-tight line-clamp-2">
                    {d}
                  </span>
                </button>
              ))}
            </div>
          </FilterSection>
        )}

        <FilterSection title="Rating Status">
          <div className="flex flex-wrap gap-1.5 px-4">
            {RATED_STATUSES.map((s) => (
              <Chip
                key={s}
                selected={filters.ratedStatus === s}
                onClick={() => set({ ratedStatus: s })}
                className="cursor-pointer"
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </Chip>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Status Flags">
          <div className="flex flex-wrap gap-1.5 px-4">
            {FLAGS.map((f) => (
              <Chip
                key={f.value}
                selected={filters.flags.includes(f.value)}
                onClick={() => set({ flags: toggle(filters.flags, f.value) })}
                className="cursor-pointer"
              >
                {f.label}
              </Chip>
            ))}
          </div>
        </FilterSection>

        {availableLengths.length > 0 && (
          <FilterSection title="Length">
            <div className="flex flex-wrap gap-1.5 px-4">
              {availableLengths.map((len) => (
                <Chip
                  key={len}
                  selected={filters.lengths.includes(len)}
                  onClick={() => set({ lengths: toggle(filters.lengths, len) })}
                  className="cursor-pointer"
                >
                  {len}
                </Chip>
              ))}
            </div>
          </FilterSection>
        )}

        {availableGameVersions.length > 0 && (
          <FilterSection title="Game Version">
            <div className="flex flex-wrap gap-1.5 px-4">
              {availableGameVersions.map((v) => (
                <Chip
                  key={v}
                  selected={filters.gameVersions.includes(v)}
                  onClick={() =>
                    set({ gameVersions: toggle(filters.gameVersions, v) })
                  }
                  className="cursor-pointer"
                >
                  {v}
                </Chip>
              ))}
            </div>
          </FilterSection>
        )}

        <FilterSection title="Level">
          <div className="flex flex-wrap gap-1.5 px-4">
            {LEVEL_FLAGS.map((f) => (
              <Chip
                key={f.value}
                selected={filters.flags.includes(f.value)}
                onClick={() => set({ flags: toggle(filters.flags, f.value) })}
                className="cursor-pointer"
              >
                {f.label}
              </Chip>
            ))}
          </div>
        </FilterSection>
      </div>

      {/* Footer */}
      <div className="flex h-12 shrink-0 items-center justify-between border-t border-[var(--color-border-subtle)] px-4">
        <p className="text-xs font-medium text-text-secondary">
          {matchCount} of {totalCount} levels match
        </p>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs font-medium text-text-primary cursor-pointer"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
